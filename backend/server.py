from dotenv import load_dotenv
load_dotenv()

import os, jwt, bcrypt, json, logging, asyncio, secrets, string, time
from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from pathlib import Path
from dataclasses import dataclass, field
from game_engine import (
    new_deck, deal, best_hand, best_hand_omaha, valid_actions, score_boards, auto_assign, is_red,
    RANK_VAL, RANK_SHORT
)

ROOT_DIR = Path(__file__).parent
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "poker_game")
JWT_SECRET = os.environ.get("JWT_SECRET", "poker-dev-secret-key-for-testing")
JWT_ALG = "HS256"

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════════════════════
# MONGODB PERSISTENCE HELPERS
# ══════════════════════════════════════════════════════════════════════════════
async def _save_table(room: 'GameRoom'):
    """Upsert table config and current player chip counts to MongoDB."""
    doc = {
        "name": room.name,
        "host_id": room.host_id,
        "blind_small": room.blind_small,
        "blind_big": room.blind_big,
        "starting_chips": room.starting_chips,
        "max_players": room.max_players,
        "hand_number": room.hand_number,
        "players": [
            {"user_id": p.user_id, "username": p.username, "avatar": p.avatar,
             "avatar_color": p.avatar_color, "seat": p.seat, "chips": p.chips}
            for p in room.players
        ],
        "updated_at": datetime.now(timezone.utc),
    }
    await db.game_tables.update_one({"_id": room.table_id}, {"$set": doc}, upsert=True)


async def _save_hand_history(room: 'GameRoom', result: Dict):
    """Persist a completed hand to MongoDB for history and stats."""
    contributions = room.hand.contributions if room.hand else {}
    chips_won = result.get("chips_won", {})
    boards_data = []
    if room.hand:
        for b in room.hand.boards:
            boards_data.append({"board_id": b.board_id,
                                 "flop": b.flop, "turn": b.turn, "river": b.river})
    players_data = []
    for p in room.players:
        won = chips_won.get(p.user_id, 0)
        cont = contributions.get(p.user_id, 0)
        players_data.append({
            "user_id": p.user_id, "username": p.username,
            "avatar": p.avatar, "avatar_color": p.avatar_color,
            "chips_won": won, "contributed": cont, "net": won - cont,
        })
    doc = {
        "table_id": room.table_id, "table_name": room.name,
        "hand_number": room.hand_number,
        "pot": result.get("pot", 0),
        "uncontested": result.get("uncontested", False),
        "winner_username": result.get("winner_username", ""),
        "board_winners": result.get("board_winners", {}),
        "points": result.get("points", {}),
        "chips_won": chips_won,
        "boards": boards_data,
        "players": players_data,
        "hole_cards_revealed": result.get("hole_cards_revealed", {}),
        "assignments": room.hand.assignments if room.hand else {},
        "played_at": datetime.now(timezone.utc),
    }
    await db.hand_history.insert_one(doc)
    # Also snapshot current chip counts after distribution
    await _save_table(room)


async def _restore_tables():
    """On startup: reload tables from MongoDB so they survive backend restarts."""
    count = 0
    async for doc in db.game_tables.find({}):
        table_id = doc["_id"]
        room = GameRoom(
            table_id=table_id, name=doc["name"], host_id=doc["host_id"],
            blind_small=doc["blind_small"], blind_big=doc["blind_big"],
            starting_chips=doc["starting_chips"], max_players=doc["max_players"],
            status="waiting", hand_number=doc.get("hand_number", 0),
        )
        for p in doc.get("players", []):
            room.players.append(GPlayer(
                user_id=p["user_id"], username=p["username"],
                avatar=p["avatar"], avatar_color=p["avatar_color"],
                seat=p["seat"], chips=p["chips"], status="waiting",
            ))
        game_rooms[table_id] = room
        count += 1
    log.info(f"Restored {count} tables from MongoDB")


# ══════════════════════════════════════════════════════════════════════════════
# AUTH HELPERS (from Phase 1 — unchanged)
# ══════════════════════════════════════════════════════════════════════════════
def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()

def verify_pin(pin: str, hashed: str) -> bool:
    return bcrypt.checkpw(pin.encode(), hashed.encode())

def create_token(uid: str, username: str, role: str) -> str:
    payload = {"sub": uid, "username": username, "role": role,
               "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(401, "User not found")
        return {"id": str(user["_id"]), "username": user["username"],
                "avatar": user["avatar"], "avatar_color": user["avatar_color"],
                "role": user["role"], "chips": user["chips"]}
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")


# ══════════════════════════════════════════════════════════════════════════════
# PRESENCE WEBSOCKET (from Phase 1 — unchanged)
# ══════════════════════════════════════════════════════════════════════════════
class PresenceManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}

    async def connect(self, uid: str, ws: WebSocket):
        await ws.accept()
        self.connections[uid] = ws
        await self._broadcast()

    def disconnect(self, uid: str):
        self.connections.pop(uid, None)

    async def _broadcast(self):
        msg = json.dumps({"type": "presence", "online_users": list(self.connections.keys())})
        for uid, ws in list(self.connections.items()):
            try:
                await ws.send_text(msg)
            except Exception:
                self.connections.pop(uid, None)

    def online_ids(self) -> List[str]:
        return list(self.connections.keys())

presence = PresenceManager()


# ══════════════════════════════════════════════════════════════════════════════
# GAME ROOM STATE
# ══════════════════════════════════════════════════════════════════════════════
@dataclass
class GPlayer:
    user_id: str
    username: str
    avatar: str
    avatar_color: str
    seat: int
    chips: int
    status: str = "waiting"       # waiting/active/folded/all_in/sitting_out
    bet_street: int = 0           # chips bet this betting round
    bet_total: int = 0            # total chips committed this hand
    has_acted: bool = False
    wants_sitout: bool = False    # player voluntarily sitting out next hand(s)

@dataclass
class GBoard:
    board_id: int
    # pre-dealt (server only)
    _flop: List[str] = field(default_factory=list)
    _turn: str = ""
    _river: str = ""
    # revealed
    flop: List[str] = field(default_factory=list)
    turn: str = ""
    river: str = ""

    def reveal_flop(self):  self.flop = list(self._flop)
    def reveal_turn(self):  self.turn = self._turn
    def reveal_river(self): self.river = self._river

    def community(self) -> List[str]:
        c = list(self.flop)
        if self.turn:  c.append(self.turn)
        if self.river: c.append(self.river)
        return c

@dataclass
class HandState:
    hole_cards: Dict[str, List[str]] = field(default_factory=dict)
    boards: List[GBoard] = field(default_factory=list)
    pot: int = 0
    bets: Dict[int, int] = field(default_factory=dict)      # seat → bet this street
    current_bet: int = 0
    last_raise: int = 0
    dealer_seat: int = 0
    sb_seat: int = 0
    bb_seat: int = 0
    assignments: Dict[str, Dict[str, List[str]]] = field(default_factory=dict)
    assign_end: float = 0.0
    contributions: Dict[str, int] = field(default_factory=dict)  # uid → total hand chips
    no_raise_uids: set = field(default_factory=set)  # uids blocked from raising (under-raise)

@dataclass
class GameRoom:
    table_id: str
    name: str
    host_id: str
    blind_small: int
    blind_big: int
    starting_chips: int
    max_players: int
    status: str = "waiting"       # waiting/playing/finished
    players: List[GPlayer] = field(default_factory=list)
    hand: Optional[HandState] = None
    round: str = "waiting"        # waiting/preflop/flop/turn/river/assignment/showdown
    current_seat: int = -1
    hand_number: int = 0
    timer_task: Optional[asyncio.Task] = None
    timer_ends: float = 0.0
    connections: Dict[str, Any] = field(default_factory=dict)  # uid → WebSocket
    last_showdown: Optional[Dict] = None
    showdown_ready: set = field(default_factory=set)  # uids who voted "Next Hand"

    # helpers
    def active(self) -> List[GPlayer]:
        return [p for p in self.players if p.status in ("active", "all_in")]

    def acting(self) -> List[GPlayer]:
        return [p for p in self.players if p.status == "active"]

    def by_uid(self, uid: str) -> Optional[GPlayer]:
        return next((p for p in self.players if p.user_id == uid), None)

    def by_seat(self, seat: int) -> Optional[GPlayer]:
        return next((p for p in self.players if p.seat == seat), None)

    def total_pot(self) -> int:
        return (self.hand.pot if self.hand else 0) + sum(self.hand.bets.values() if self.hand else [])

game_rooms: Dict[str, GameRoom] = {}


# ══════════════════════════════════════════════════════════════════════════════
# BROADCAST HELPERS
# ══════════════════════════════════════════════════════════════════════════════
def _compute_pots(room: 'GameRoom') -> List[Dict]:
    """Compute side pots from total player contributions for live display."""
    if not room.hand:
        return []
    # Contributions = p.bet_total (cumulative across all streets including current)
    contribs: Dict[str, int] = {}
    for p in room.players:
        if p.status != 'sitting_out' and p.bet_total > 0:
            contribs[p.user_id] = p.bet_total
    if not contribs:
        return []
    # Players still eligible to win (active + all_in = still in the hand)
    eligible_set = {p.user_id for p in room.players if p.status in ('active', 'all_in')}
    sorted_levels = sorted(set(contribs.values()))
    pots: List[Dict] = []
    prev = 0
    contributors = list(contribs.keys())
    for level in sorted_levels:
        amt = (level - prev) * len(contributors)
        if amt > 0:
            eligible = [uid for uid in contributors if uid in eligible_set]
            pots.append({"amount": amt, "eligible_uids": eligible})
        contributors = [uid for uid in contributors if contribs[uid] > level]
        prev = level
    return [p for p in pots if p["eligible_uids"]]  # hide uncontested excess pots


def _public_state(room: GameRoom) -> Dict:
    boards = []
    if room.hand:
        for b in room.hand.boards:
            boards.append({"board_id": b.board_id, "flop": b.flop,
                           "turn": b.turn, "river": b.river})
    players = [{"user_id": p.user_id, "username": p.username, "avatar": p.avatar,
                "avatar_color": p.avatar_color, "seat": p.seat, "chips": p.chips,
                "status": p.status, "bet_street": p.bet_street,
                "wants_sitout": p.wants_sitout}
               for p in room.players]
    return {
        "table_id": room.table_id, "name": room.name, "status": room.status,
        "round": room.round, "players": players, "boards": boards,
        "pot": room.hand.pot if room.hand else 0,
        "current_bet": room.hand.current_bet if room.hand else 0,
        "last_raise": room.hand.last_raise if room.hand else 0,
        "current_seat": room.current_seat,
        "dealer_seat": room.hand.dealer_seat if room.hand else 0,
        "sb_seat": room.hand.sb_seat if room.hand else 0,
        "bb_seat": room.hand.bb_seat if room.hand else 0,
        "hand_number": room.hand_number,
        "blind_small": room.blind_small, "blind_big": room.blind_big,
        "max_players": room.max_players, "starting_chips": room.starting_chips,
        "timer_ends": room.timer_ends,
        "assigned_uids": list(room.hand.assignments.keys()) if room.hand else [],
        "last_showdown": room.last_showdown,
        "showdown_ready": list(room.showdown_ready),
        "pots": _compute_pots(room),
    }

async def _broadcast(room: GameRoom, msg: Dict):
    data = json.dumps(msg)
    for uid, ws in list(room.connections.items()):
        try:
            await ws.send_text(data)
        except Exception:
            room.connections.pop(uid, None)

async def _send(room: GameRoom, uid: str, msg: Dict):
    ws = room.connections.get(uid)
    if ws:
        try:
            await ws.send_text(json.dumps(msg))
        except Exception:
            room.connections.pop(uid, None)

async def _broadcast_state(room: GameRoom):
    await _broadcast(room, {"type": "game_state", "data": _public_state(room)})


# ══════════════════════════════════════════════════════════════════════════════
# GAME ENGINE — HAND FLOW
# ══════════════════════════════════════════════════════════════════════════════
def _gen_table_id() -> str:
    return ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(6))

def _next_active_seat(room: GameRoom, from_seat: int) -> int:
    """Find next active (non-folded) player seat after from_seat."""
    n = room.max_players
    for i in range(1, n + 1):
        seat = (from_seat + i) % n
        p = room.by_seat(seat)
        if p and p.status == "active":
            return seat
    return -1

def _first_to_act(room: GameRoom, post_flop: bool) -> int:
    """First player to act in a betting round."""
    if not room.hand:
        return -1
    n = room.max_players
    if post_flop:
        start = (room.hand.dealer_seat + 1) % n
    else:
        # Pre-flop: player after BB
        start = (room.hand.bb_seat + 1) % n
    for i in range(n):
        seat = (start + i) % n
        p = room.by_seat(seat)
        if p and p.status == "active":
            return seat
    return -1

def _betting_over(room: GameRoom) -> bool:
    """Return True when all acting players have matched current_bet and acted."""
    if not room.hand:
        return True
    acting = room.acting()
    if not acting:
        return True
    for p in acting:
        b = room.hand.bets.get(p.seat, 0)
        if not p.has_acted or b < room.hand.current_bet:
            return False
    return True

async def _start_timer(room: GameRoom, secs: float, coro):
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.timer_ends = time.time() + secs
    room.timer_task = asyncio.create_task(coro)

async def _start_hand(room: GameRoom):
    """Deal cards and begin pre-flop betting."""
    room.hand_number += 1
    active = [p for p in room.players if p.chips > 0 and not p.wants_sitout]
    if len(active) < 2:
        room.status = "waiting"
        room.round = "waiting"
        await _broadcast_state(room)
        return

    # Reset player status (respect voluntary sit-out)
    for p in room.players:
        p.status = "sitting_out" if (p.chips <= 0 or p.wants_sitout) else "active"
        p.bet_street = 0
        p.bet_total = 0
        p.has_acted = False

    # Rotate dealer
    seated = sorted([p for p in room.players if p.chips > 0], key=lambda p: p.seat)
    prev_dealer = room.hand.dealer_seat if room.hand else -1
    dealers = [p.seat for p in seated]
    if prev_dealer in dealers:
        idx = (dealers.index(prev_dealer) + 1) % len(dealers)
    else:
        idx = 0
    dealer_seat = dealers[idx]

    n = room.max_players
    # SB / BB - next active seat AFTER dealer, then AFTER SB
    for p in room.players:
        p.status = "active" if p.chips > 0 else "sitting_out"
    sb_seat = _next_active_seat(room, dealer_seat)  # player after dealer is SB
    bb_seat = _next_active_seat(room, sb_seat)       # player after SB is BB
    # Heads up: dealer = SB, other player = BB
    if len(active) == 2:
        sb_seat = dealer_seat
        bb_seat = _next_active_seat(room, dealer_seat)  # the other player is BB

    # Deal
    deck = new_deck()
    hole_cards: Dict[str, List[str]] = {}
    for p in room.players:
        if p.status == "active":
            cards, deck = deal(deck, 6)
            hole_cards[p.user_id] = cards

    # Pre-deal 3 boards (5 cards each: flop0-2, turn=3, river=4)
    boards = []
    for i in range(3):
        bc, deck = deal(deck, 5)
        boards.append(GBoard(board_id=i + 1, _flop=bc[:3], _turn=bc[3], _river=bc[4]))

    # Build hand state
    room.hand = HandState(
        hole_cards=hole_cards,
        boards=boards,
        pot=0,
        bets={},
        current_bet=room.blind_big,
        last_raise=room.blind_big,
        dealer_seat=dealer_seat,
        sb_seat=sb_seat,
        bb_seat=bb_seat,
    )

    # Post blinds
    sb_player = room.by_seat(sb_seat)
    bb_player = room.by_seat(bb_seat)
    if sb_player:
        sb_amt = min(room.blind_small, sb_player.chips)
        sb_player.chips -= sb_amt
        sb_player.bet_street = sb_amt
        sb_player.bet_total = sb_amt
        sb_player.has_acted = False
        room.hand.bets[sb_seat] = sb_amt
    if bb_player:
        bb_amt = min(room.blind_big, bb_player.chips)
        bb_player.chips -= bb_amt
        bb_player.bet_street = bb_amt
        bb_player.bet_total = bb_amt
        bb_player.has_acted = False
        room.hand.bets[bb_seat] = bb_amt
        if bb_player.chips == 0:
            bb_player.status = "all_in"

    room.round = "preflop"
    room.status = "playing"
    room.current_seat = _first_to_act(room, post_flop=False)

    # Send hole cards privately
    for uid, cards in hole_cards.items():
        await _send(room, uid, {"type": "hole_cards", "data": {"hole_cards": cards}})

    # Set timer BEFORE broadcast so clients receive the correct timer_ends
    await _start_timer(room, 30, _auto_fold(room.table_id, room.current_seat, room.hand_number))
    await _broadcast_state(room)
    await _send_valid_actions(room)


async def _send_valid_actions(room: GameRoom):
    """Send valid actions to the current player."""
    if room.current_seat < 0 or not room.hand:
        return
    p = room.by_seat(room.current_seat)
    if not p or p.status != "active":
        return
    total_pot = room.total_pot()
    # Effective stack cap: max total any active/all-in opponent can commit this street
    active_opps = [q for q in room.players if q.user_id != p.user_id
                   and q.status in ("active", "all_in")]
    opp_max = max((q.chips + q.bet_street for q in active_opps), default=None)
    acts = valid_actions(
        player_chips=p.chips,
        player_bet=p.bet_street,
        current_bet=room.hand.current_bet,
        last_raise_size=room.hand.last_raise,
        blind_big=room.blind_big,
        total_pot=total_pot,
        opp_max=opp_max,
    )
    # Under-raise restriction: player's action was not reopened — can only call or fold
    if p.user_id in room.hand.no_raise_uids:
        acts.pop("raise", None)
        # Remove all_in only if it would exceed current_bet (i.e., it's a raise in disguise)
        if "all_in" in acts and acts["all_in"] > room.hand.current_bet:
            acts.pop("all_in", None)
    await _send(room, p.user_id, {"type": "your_turn",
                                   "data": {"valid_actions": acts, "time_limit": 30}})


async def _apply_action(room: GameRoom, uid: str, action: str, amount: int):
    """Process a player action."""
    if not room.hand:
        return
    p = room.by_uid(uid)
    if not p or p.seat != room.current_seat or p.status != "active":
        await _send(room, uid, {"type": "error", "data": {"message": "Not your turn"}})
        return

    # Cancel current timer
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()

    to_call = room.hand.current_bet - p.bet_street

    if action == "fold":
        p.status = "folded"
        p.has_acted = True

    elif action == "check":
        if to_call > 0:
            await _send(room, uid, {"type": "error", "data": {"message": "Cannot check — must call or raise"}})
            return
        p.has_acted = True

    elif action == "call":
        call_amt = min(to_call, p.chips)
        p.chips -= call_amt
        p.bet_street += call_amt
        p.bet_total += call_amt
        room.hand.bets[p.seat] = p.bet_street
        if p.chips == 0:
            p.status = "all_in"
        p.has_acted = True

    elif action in ("raise", "all_in"):
        total_pot = room.total_pot()
        # Apply same effective stack cap as valid_actions display
        active_opps = [q for q in room.players if q.user_id != uid
                       and q.status in ("active", "all_in")]
        opp_max = max((q.chips + q.bet_street for q in active_opps), default=None)
        acts = valid_actions(p.chips, p.bet_street, room.hand.current_bet,
                             room.hand.last_raise, room.blind_big, total_pot, opp_max)
        if action == "all_in":
            amount = acts.get("all_in", p.bet_street + p.chips)

        # Validate amount
        ra = acts.get("raise")
        if ra:
            amount = max(ra["min"], min(ra["max"], amount))
        elif "all_in" in acts:
            amount = acts["all_in"]  # respect effective stack cap
        else:
            amount = p.bet_street + p.chips  # fallback

        add_chips = amount - p.bet_street
        raise_size = amount - room.hand.current_bet
        p.chips -= add_chips
        p.bet_street = amount
        p.bet_total += add_chips
        room.hand.bets[p.seat] = amount

        # Determine if this is a full raise or an under-raise
        # Full raise: raise_size must be >= the previous raise increment (or BB if first raise)
        min_raise_increment = room.hand.last_raise if room.hand.last_raise > 0 else room.blind_big
        is_full_raise = raise_size >= min_raise_increment

        if is_full_raise and raise_size > 0:
            room.hand.last_raise = raise_size  # only update on full raise
        room.hand.current_bet = amount
        if p.chips == 0:
            p.status = "all_in"
        p.has_acted = True

        if is_full_raise:
            # Full raise: action reopens — clear restrictions, reset has_acted for active players
            room.hand.no_raise_uids = set()
            for other in room.players:
                if other.user_id != uid and other.status == "active":
                    other.has_acted = False
        else:
            # Under-raise (all-in < min raise): action does NOT reopen for players who already acted
            # Add all active players who already acted to the no-raise restriction set
            for other in room.players:
                if other.user_id != uid and other.status == "active" and other.has_acted:
                    room.hand.no_raise_uids.add(other.user_id)

    # Track total contributions
    room.hand.contributions[uid] = room.hand.contributions.get(uid, 0)
    room.hand.contributions[uid] = p.bet_total

    # Check if only one player remains
    active = room.active()
    if len([p for p in room.players if p.status not in ("folded", "sitting_out")]) == 1:
        await _end_hand_last_player(room)
        return

    # Check if betting round is over
    if _betting_over(room):
        await _advance_round(room)
    else:
        room.current_seat = _next_active_seat(room, room.current_seat)  # next player after current
        # Set timer BEFORE broadcast so clients receive correct timer_ends
        await _start_timer(room, 30, _auto_fold(room.table_id, room.current_seat, room.hand_number))
        await _broadcast_state(room)
        await _send_valid_actions(room)


async def _advance_round(room: GameRoom):
    """Move to next street or assignment phase."""
    if not room.hand:
        return

    # Collect bets into pot
    room.hand.pot += sum(room.hand.bets.values())
    room.hand.bets = {}
    room.hand.current_bet = 0
    room.hand.last_raise = 0
    room.hand.no_raise_uids = set()  # new street — all restrictions lifted
    for p in room.players:
        p.bet_street = 0
        p.has_acted = False

    current = room.round
    if current == "preflop":
        room.round = "flop"
        for b in room.hand.boards:
            b.reveal_flop()
    elif current == "flop":
        room.round = "turn"
        for b in room.hand.boards:
            b.reveal_turn()
    elif current == "turn":
        room.round = "river"
        for b in room.hand.boards:
            b.reveal_river()
    elif current == "river":
        await _start_assignment(room)
        return

    # Skip to showdown if only one acting player can still act (others all-in)
    acting = room.acting()
    if len(acting) <= 1 and room.round in ("flop", "turn", "river"):
        # Auto-advance through remaining streets
        await _advance_round(room)
        return

    room.current_seat = _first_to_act(room, post_flop=True)
    # Set timer BEFORE broadcast so clients receive correct timer_ends
    await _start_timer(room, 30, _auto_fold(room.table_id, room.current_seat, room.hand_number))
    await _broadcast_state(room)
    await _send_valid_actions(room)


async def _start_assignment(room: GameRoom):
    """Enter card assignment phase (60 seconds)."""
    if not room.hand:
        return
    room.round = "assignment"
    room.current_seat = -1
    room.hand.assignments = {}
    room.hand.assign_end = time.time() + 60
    room.timer_ends = room.hand.assign_end

    # Reveal all remaining community cards (in case they were hidden)
    for b in room.hand.boards:
        b.reveal_flop()
        b.reveal_turn()
        b.reveal_river()

    await _broadcast_state(room)

    # Re-send hole cards to active players
    for p in room.active():
        cards = room.hand.hole_cards.get(p.user_id, [])
        await _send(room, p.user_id, {"type": "hole_cards", "data": {"hole_cards": cards}})

    await _start_timer(room, 60, _auto_assign_timer(room.table_id, room.hand_number))


async def _submit_assignment(room: GameRoom, uid: str, assignment: Dict[str, List[str]]):
    """Process a player's card assignment."""
    if not room.hand or room.round != "assignment":
        return
    p = room.by_uid(uid)
    if not p or p.status not in ("active", "all_in"):
        return

    hole = room.hand.hole_cards.get(uid, [])
    # Validate: exactly 2 cards per board, all 6 used once
    b1 = assignment.get("board_1", [])
    b2 = assignment.get("board_2", [])
    b3 = assignment.get("board_3", [])
    all_assigned = b1 + b2 + b3
    if (len(b1) != 2 or len(b2) != 2 or len(b3) != 2 or
            sorted(all_assigned) != sorted(hole)):
        await _send(room, uid, {"type": "error", "data": {"message": "Invalid card assignment"}})
        return

    room.hand.assignments[uid] = {"board_1": b1, "board_2": b2, "board_3": b3}

    # Broadcast who has assigned (without revealing cards)
    await _broadcast_state(room)

    # All active players assigned? → showdown
    active_uids = {p.user_id for p in room.active()}
    if active_uids.issubset(set(room.hand.assignments.keys())):
        if room.timer_task and not room.timer_task.done():
            room.timer_task.cancel()
        await _finalize_showdown(room)


async def _finalize_showdown(room: GameRoom):
    """Evaluate boards, distribute pot, broadcast results."""
    if not room.hand:
        return
    room.round = "showdown"

    # Auto-assign anyone who didn't submit
    for p in room.active():
        if p.user_id not in room.hand.assignments:
            hole = room.hand.hole_cards.get(p.user_id, [])
            room.hand.assignments[p.user_id] = auto_assign(hole, {})

    community = [b.community() for b in room.hand.boards]

    # Ensure contributions include folded players' bets
    for p in room.players:
        if p.user_id not in room.hand.contributions:
            room.hand.contributions[p.user_id] = p.bet_total

    result = score_boards(
        community_cards=community,
        assignments=room.hand.assignments,
        pot=room.hand.pot,
        total_contributions={uid: v for uid, v in room.hand.contributions.items()
                             if room.by_uid(uid) and room.by_uid(uid).status in ("active", "all_in")},
    )

    # Apply chip changes
    for uid, chips in result["chips_won"].items():
        p = room.by_uid(uid)
        if p:
            p.chips += chips

    # Include hole cards in showdown broadcast (reveal all)
    result["hole_cards_revealed"] = room.hand.hole_cards
    result["player_statuses"] = {p.user_id: p.status for p in room.players}
    room.last_showdown = result

    # Persist hand to MongoDB
    await _save_hand_history(room, result)

    # 2-minute showdown timer — players can vote to skip early
    room.showdown_ready = set()
    await _broadcast(room, {"type": "showdown_result", "data": result})
    await _start_timer(room, 120, _next_hand_auto(room.table_id, room.hand_number, 120))
    await _broadcast_state(room)


async def _end_hand_last_player(room: GameRoom):
    """One player left — they win the pot."""
    if not room.hand:
        return

    # Cancel any active timer and clear the timer display immediately
    if room.timer_task and not room.timer_task.done():
        room.timer_task.cancel()
    room.timer_ends = 0

    room.hand.pot += sum(room.hand.bets.values())
    winner = next((p for p in room.players if p.status not in ("folded", "sitting_out")), None)
    if winner:
        winner.chips += room.hand.pot

    result = {
        "player_results": {},
        "board_winners": {"board_1": [], "board_2": [], "board_3": []},
        "points": {},
        "chips_won": {winner.user_id: room.hand.pot} if winner else {},
        "pot": room.hand.pot,
        "uncontested": True,
        "winner_username": winner.username if winner else "",
        "hole_cards_revealed": {},  # don't reveal on uncontested win
        "player_statuses": {p.user_id: p.status for p in room.players},
    }
    room.last_showdown = result
    room.round = "showdown"
    room.showdown_ready = set()

    # Persist hand to MongoDB
    await _save_hand_history(room, result)

    await _broadcast(room, {"type": "showdown_result", "data": result})
    # 30-second showdown timer for uncontested wins (shorter since nothing to review)
    await _start_timer(room, 30, _next_hand_auto(room.table_id, room.hand_number, 30))
    await _broadcast_state(room)


# ── Timer coroutines ──────────────────────────────────────────────────────────
async def _auto_fold(table_id: str, seat: int, hand_num: int, wait_secs: float = 30):
    """Auto-action when player times out: check if possible, otherwise fold."""
    import logging
    logging.info(f"_auto_fold scheduled for table {table_id}, seat {seat}, hand {hand_num}, waiting {wait_secs}s")
    await asyncio.sleep(wait_secs)
    logging.info(f"_auto_fold executing for table {table_id}, seat {seat}")
    room = game_rooms.get(table_id)
    if not room:
        logging.info(f"_auto_fold cancelled - room not found")
        return
    if room.hand_number != hand_num:
        logging.info(f"_auto_fold cancelled - hand changed ({room.hand_number} != {hand_num})")
        return
    if room.current_seat != seat:
        logging.info(f"_auto_fold cancelled - seat changed ({room.current_seat} != {seat})")
        return
    p = room.by_seat(seat)
    if not p or not room.hand:
        logging.info(f"_auto_fold cancelled - player or hand missing")
        return
    
    # Check if player can check (no bet to call)
    player_bet = room.hand.bets.get(p.seat, 0)
    current_bet = room.hand.current_bet
    to_call = current_bet - player_bet
    
    logging.info(f"_auto_fold: player_bet={player_bet}, current_bet={current_bet}, to_call={to_call}")
    
    if to_call == 0:
        # Player can check - auto-check instead of fold
        logging.info(f"Auto-CHECK for {p.username}")
        await _apply_action(room, p.user_id, "check", 0)
    else:
        # Player must call or fold - auto-fold
        logging.info(f"Auto-FOLD for {p.username}")
        await _apply_action(room, p.user_id, "fold", 0)


async def _next_hand_auto(table_id: str, hand_num: int, secs: float = 120):
    """Auto-start next hand after showdown timer expires."""
    await asyncio.sleep(secs)
    room = game_rooms.get(table_id)
    if not room or room.hand_number != hand_num:
        return
    if room.status == "playing":
        await _start_hand(room)


async def _auto_assign_timer(table_id: str, hand_num: int):
    await asyncio.sleep(60)
    room = game_rooms.get(table_id)
    if not room or not room.hand or room.hand_number != hand_num or room.round != "assignment":
        return
    for p in room.active():
        if p.user_id not in room.hand.assignments:
            hole = room.hand.hole_cards.get(p.user_id, [])
            existing = room.hand.assignments.get(p.user_id, {})
            room.hand.assignments[p.user_id] = auto_assign(hole, existing)
    await _finalize_showdown(room)


# ══════════════════════════════════════════════════════════════════════════════
# REST ROUTES — Tables
# ══════════════════════════════════════════════════════════════════════════════
class CreateTableReq(BaseModel):
    name: str
    blind_small: int = 10
    blind_big: int = 20
    starting_chips: int = 5000
    max_players: int = 6

class JoinTableReq(BaseModel):
    table_id: str
    preferred_seat: Optional[int] = None

class DistributeChipsReq(BaseModel):
    target_username: str
    amount: int

class TopUpReq(BaseModel):
    amount: int

class GiveChipsReq(BaseModel):
    amount: int

class LoginReq(BaseModel):
    username: str
    pin: str

class QuickLoginReq(BaseModel):
    username: str


@api.post("/auth/login")
async def login(req: LoginReq):
    user = await db.users.find_one({"username": req.username})
    if not user or not verify_pin(req.pin, user["pin_hash"]):
        raise HTTPException(401, "Invalid username or PIN")
    uid = str(user["_id"])
    return {"token": create_token(uid, user["username"], user["role"]),
            "user": {"id": uid, "username": user["username"], "avatar": user["avatar"],
                     "avatar_color": user["avatar_color"], "role": user["role"], "chips": user["chips"]}}


@api.post("/auth/login-quick")
async def login_quick(req: QuickLoginReq):
    """PIN-free login — click-to-enter for casual play."""
    user = await db.users.find_one({"username": req.username})
    if not user:
        raise HTTPException(404, "User not found")
    uid = str(user["_id"])
    return {"token": create_token(uid, user["username"], user["role"]),
            "user": {"id": uid, "username": user["username"], "avatar": user["avatar"],
                     "avatar_color": user["avatar_color"], "role": user["role"], "chips": user["chips"]}}


@api.get("/auth/me")
async def me(cu: dict = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(cu["id"])})
    if not user:
        raise HTTPException(404, "User not found")
    return {"id": str(user["_id"]), "username": user["username"], "avatar": user["avatar"],
            "avatar_color": user["avatar_color"], "role": user["role"], "chips": user["chips"]}


@api.get("/players")
async def get_players():
    online = presence.online_ids()
    players = await db.users.find({}, {"pin_hash": 0}).to_list(100)
    return [{"id": str(p["_id"]), "username": p["username"], "avatar": p["avatar"],
             "avatar_color": p["avatar_color"], "role": p["role"], "chips": p["chips"],
             "online": str(p["_id"]) in online} for p in players]


@api.post("/admin/distribute-chips")
async def distribute_chips(req: DistributeChipsReq, cu: dict = Depends(get_current_user)):
    if cu["role"] != "admin":
        raise HTTPException(403, "Admin only")
    result = await db.users.update_one({"username": req.target_username}, {"$inc": {"chips": req.amount}})
    if not result.matched_count:
        raise HTTPException(404, "Player not found")
    u = await db.users.find_one({"username": req.target_username})
    return {"success": True, "username": req.target_username, "new_chips": u["chips"]}


@api.get("/tables")
async def list_tables():
    return [
        {
            "table_id": r.table_id, "name": r.name, "status": r.status,
            "blind_small": r.blind_small, "blind_big": r.blind_big,
            "max_players": r.max_players, "starting_chips": r.starting_chips,
            "player_count": len(r.players),
            "players": [{"username": p.username, "avatar": p.avatar,
                         "avatar_color": p.avatar_color} for p in r.players],
        }
        for r in game_rooms.values() if r.status in ("waiting", "playing")
    ]


@api.post("/tables/create")
async def create_table(req: CreateTableReq, cu: dict = Depends(get_current_user)):
    if req.blind_big < req.blind_small * 2:
        raise HTTPException(400, "Big blind must be ≥ 2× small blind")
    table_id = _gen_table_id()
    room = GameRoom(
        table_id=table_id, name=req.name, host_id=cu["id"],
        blind_small=req.blind_small, blind_big=req.blind_big,
        starting_chips=req.starting_chips, max_players=req.max_players,
    )
    game_rooms[table_id] = room
    await _save_table(room)
    return {"table_id": table_id, "name": req.name}


@api.post("/tables/join")
async def join_table(req: JoinTableReq, cu: dict = Depends(get_current_user)):
    room = game_rooms.get(req.table_id)
    if not room:
        raise HTTPException(404, "Table not found")
    if len(room.players) >= room.max_players:
        raise HTTPException(400, "Table full")
    if room.by_uid(cu["id"]):
        return {"table_id": req.table_id, "seat": room.by_uid(cu["id"]).seat}  # already joined
    # Resolve which seat to take
    if req.preferred_seat is not None:
        if req.preferred_seat < 0 or req.preferred_seat >= room.max_players:
            raise HTTPException(400, "Invalid seat number")
        if room.by_seat(req.preferred_seat) is not None:
            raise HTTPException(400, "Seat already taken")
        seat = req.preferred_seat
    else:
        avail = [s for s in range(room.max_players) if not room.by_seat(s)]
        if not avail:
            raise HTTPException(400, "Table full")
        seat = avail[0]
    # Join as sitting_out if mid-game so the current hand is unaffected
    player_status = "sitting_out" if room.status == "playing" else "waiting"
    room.players.append(GPlayer(
        user_id=cu["id"], username=cu["username"], avatar=cu["avatar"],
        avatar_color=cu["avatar_color"], seat=seat, chips=room.starting_chips,
        status=player_status,
    ))
    # Broadcast updated player list to all connected clients (including spectators)
    await _broadcast_state(room)
    await _save_table(room)
    return {"table_id": req.table_id, "seat": seat}


@api.post("/tables/{table_id}/topup")
async def topup_chips(table_id: str, req: TopUpReq, cu: dict = Depends(get_current_user)):
    """Player tops up their in-game chips from their bankroll."""
    room = game_rooms.get(table_id)
    if not room:
        raise HTTPException(404, "Table not found")
    p = room.by_uid(cu["id"])
    if not p:
        raise HTTPException(400, "Not seated at this table")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    # Max top-up = largest stack at the table OR starting chips, whichever is greater
    max_stack = max((q.chips for q in room.players), default=room.starting_chips)
    max_allowed = max(max_stack, room.starting_chips)
    headroom = max_allowed - p.chips
    if headroom <= 0:
        raise HTTPException(400, "Already at or above maximum stack")
    amount = min(req.amount, headroom)
    # Check bankroll
    user = await db.users.find_one({"_id": ObjectId(cu["id"])})
    if not user or user["chips"] < amount:
        raise HTTPException(400, f"Insufficient bankroll (have {user['chips'] if user else 0}, need {amount})")
    await db.users.update_one({"_id": ObjectId(cu["id"])}, {"$inc": {"chips": -amount}})
    p.chips += amount
    await _save_table(room)
    await _broadcast_state(room)
    return {"success": True, "chips_added": amount, "new_chips": p.chips,
            "new_bankroll": user["chips"] - amount}


@api.post("/tables/{table_id}/admin/give-chips/{uid}")
async def admin_give_chips_at_table(table_id: str, uid: str, req: GiveChipsReq, cu: dict = Depends(get_current_user)):
    """Admin gives chips directly to a player's in-game stack and bankroll."""
    if cu.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    room = game_rooms.get(table_id)
    if not room:
        raise HTTPException(404, "Table not found")
    p = room.by_uid(uid)
    if not p:
        raise HTTPException(404, "Player not at this table")
    # Add to in-game chips and bankroll
    p.chips += req.amount
    await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"chips": req.amount}})
    await _save_table(room)
    await _broadcast_state(room)
    user = await db.users.find_one({"_id": ObjectId(uid)}, {"pin_hash": 0})
    return {"success": True, "chips_added": req.amount, "new_chips": p.chips,
            "new_bankroll": user["chips"] if user else 0}


@api.post("/admin/players/{uid}/give-chips")
async def admin_give_bankroll_chips(uid: str, req: GiveChipsReq, cu: dict = Depends(get_current_user)):
    """Admin adds chips directly to a player's bankroll (global)."""
    if cu.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    if req.amount <= 0:
        raise HTTPException(400, "Amount must be positive")
    result = await db.users.update_one({"_id": ObjectId(uid)}, {"$inc": {"chips": req.amount}})
    if not result.matched_count:
        raise HTTPException(404, "Player not found")
    user = await db.users.find_one({"_id": ObjectId(uid)}, {"pin_hash": 0})
    return {"success": True, "chips_added": req.amount, "new_bankroll": user["chips"]}


@api.delete("/tables/{table_id}/leave")
async def leave_table(table_id: str, cu: dict = Depends(get_current_user)):
    room = game_rooms.get(table_id)
    if not room:
        raise HTTPException(404, "Table not found")
    room.players = [p for p in room.players if p.user_id != cu["id"]]
    # Disconnect the leaving player's WS
    room.connections.pop(cu["id"], None)
    if not room.players:
        del game_rooms[table_id]
        await db.game_tables.delete_one({"_id": table_id})
    else:
        await _broadcast_state(room)
        await _save_table(room)
    return {"success": True}


@api.delete("/tables/{table_id}")
async def delete_table(table_id: str, cu: dict = Depends(get_current_user)):
    """Admin-only endpoint to delete a table"""
    if cu.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    room = game_rooms.get(table_id)
    if not room:
        raise HTTPException(404, "Table not found")
    # Close all websocket connections for this table
    for uid, ws in list(room.connections.items()):
        try:
            await ws.close(code=4001, reason="Table deleted by admin")
        except:
            pass
    room.connections.clear()
    # Remove the table from memory and MongoDB
    del game_rooms[table_id]
    await db.game_tables.delete_one({"_id": table_id})
    return {"success": True, "message": f"Table {table_id} deleted"}


@api.post("/tables/{table_id}/kick/{kicked_uid}")
async def kick_player(table_id: str, kicked_uid: str, cu: dict = Depends(get_current_user)):
    """Admin-only endpoint to kick a player/spectator from a table"""
    if cu.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    room = game_rooms.get(table_id)
    if not room:
        raise HTTPException(404, "Table not found")
    # Close WebSocket for kicked user
    if kicked_uid in room.connections:
        ws = room.connections[kicked_uid]
        try:
            await ws.close(code=4003, reason="Kicked by admin")
        except Exception:
            pass
        room.connections.pop(kicked_uid, None)
    # Remove from players list if they were a player
    room.players = [p for p in room.players if p.user_id != kicked_uid]
    await _broadcast_state(room)
    await _save_table(room)
    return {"success": True, "message": f"Player {kicked_uid} kicked"}


# ══════════════════════════════════════════════════════════════════════════════
# HISTORY & STATS
# ══════════════════════════════════════════════════════════════════════════════
@api.get("/history")
async def get_history(limit: int = 50, table_id: Optional[str] = None):
    """Recent completed hands, newest first."""
    query = {"table_id": table_id} if table_id else {}
    hands = await db.hand_history.find(
        query, {"_id": 0, "player_results": 0}
    ).sort("played_at", -1).limit(limit).to_list(limit)
    # Convert datetime to ISO string for JSON serialisation
    for h in hands:
        if "played_at" in h:
            h["played_at"] = h["played_at"].isoformat()
    return hands


@api.get("/stats")
async def get_player_stats():
    """Aggregate per-player stats from all hand history."""
    hands = await db.hand_history.find(
        {}, {"_id": 0, "player_results": 0}
    ).to_list(10000)

    stats: Dict[str, Any] = {}
    for hand in hands:
        for p in hand.get("players", []):
            uid = p["user_id"]
            if uid not in stats:
                stats[uid] = {
                    "user_id": uid,
                    "username": p["username"],
                    "avatar": p["avatar"],
                    "avatar_color": p.get("avatar_color", "#ffffff"),
                    "hands_played": 0,
                    "boards_won": 0,
                    "chips_net": 0,
                    "pots_won": 0,
                }
            s = stats[uid]
            s["hands_played"] += 1
            s["chips_net"] += p.get("net", 0)
            # Count boards won
            for winners in hand.get("board_winners", {}).values():
                if uid in winners:
                    s["boards_won"] += 1
            # Pot won = had the most points in this hand
            points = hand.get("points", {})
            if points:
                max_pts = max(points.values())
                if points.get(uid, 0) >= max_pts and max_pts > 0:
                    s["pots_won"] += 1

    return sorted(stats.values(), key=lambda x: x["chips_net"], reverse=True)


# ══════════════════════════════════════════════════════════════════════════════
# GAME WEBSOCKET
# ══════════════════════════════════════════════════════════════════════════════
@api.websocket("/game/ws/{table_id}/{user_id}")
async def game_ws(ws: WebSocket, table_id: str, user_id: str):
    room = game_rooms.get(table_id)
    if not room:
        await ws.close(code=4004, reason="Table not found")
        return

    await ws.accept()
    room.connections[user_id] = ws
    log.info(f"Player {user_id} connected to table {table_id}")

    # Send current state
    await _send(room, user_id, {"type": "game_state", "data": _public_state(room)})
    # Send private hole cards if mid-hand
    if room.hand and room.round not in ("waiting", "showdown"):
        cards = room.hand.hole_cards.get(user_id)
        if cards:
            await _send(room, user_id, {"type": "hole_cards", "data": {"hole_cards": cards}})
    # Send valid actions if it's their turn
    if room.hand and room.round not in ("assignment", "showdown", "waiting"):
        p = room.by_uid(user_id)
        if p and p.seat == room.current_seat and p.status == "active":
            await _send_valid_actions(room)

    await _broadcast(room, {"type": "player_connected", "data": {"user_id": user_id}})
    await _broadcast_state(room)  # Notify all players of updated player list

    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            mtype = msg.get("type")
            data = msg.get("data", {})

            if mtype == "start_game":
                p = room.by_uid(user_id)
                if user_id != room.host_id:
                    await _send(room, user_id, {"type": "error", "data": {"message": "Only host can start"}})
                elif len(room.players) < 2:
                    await _send(room, user_id, {"type": "error", "data": {"message": "Need ≥2 players"}})
                elif room.status not in ("waiting",):
                    await _send(room, user_id, {"type": "error", "data": {"message": "Game already started"}})
                else:
                    await _start_hand(room)

            elif mtype == "player_action":
                action = data.get("action", "fold")
                amount = int(data.get("amount", 0))
                # Under-raise enforcement: player in no_raise_uids cannot raise above current_bet
                if room.hand and action in ("raise", "all_in") and user_id in room.hand.no_raise_uids:
                    p_check = room.by_uid(user_id)
                    if p_check and (p_check.bet_street + p_check.chips) <= room.hand.current_bet:
                        # All-in for ≤ current_bet is effectively a call — allow it
                        action = "call"
                    else:
                        await _send(room, user_id, {"type": "error", "data": {"message": "Cannot raise — under-raise: action not reopened"}})
                        continue
                await _apply_action(room, user_id, action, amount)

            elif mtype == "assign_cards":
                assignment = {
                    "board_1": data.get("board_1", []),
                    "board_2": data.get("board_2", []),
                    "board_3": data.get("board_3", []),
                }
                await _submit_assignment(room, user_id, assignment)

            elif mtype == "ready_next_hand":
                # Player votes to skip showdown timer and start next hand early
                if room.round == "showdown":
                    room.showdown_ready.add(user_id)
                    await _broadcast_state(room)
                    # Only count players who participated in this hand (not sitting_out)
                    participated_uids = {p.user_id for p in room.players if p.status != 'sitting_out'}
                    connected_participated_uids = set(room.connections.keys()) & participated_uids
                    if connected_participated_uids and connected_participated_uids.issubset(room.showdown_ready):
                        if room.timer_task and not room.timer_task.done():
                            room.timer_task.cancel()
                        await _start_timer(room, 5, _next_hand_auto(room.table_id, room.hand_number, 5))
                        await _broadcast_state(room)

            elif mtype == "toggle_sitout":
                p = room.by_uid(user_id)
                if p:
                    p.wants_sitout = not p.wants_sitout
                    await _broadcast_state(room)

            elif mtype == "ping":
                await _send(room, user_id, {"type": "pong"})

    except WebSocketDisconnect:
        room.connections.pop(user_id, None)
        log.info(f"Player {user_id} disconnected from {table_id}")
        await _broadcast(room, {"type": "player_disconnected", "data": {"user_id": user_id}})


# ══════════════════════════════════════════════════════════════════════════════
# PRESENCE WEBSOCKET (Phase 1 — unchanged)
# ══════════════════════════════════════════════════════════════════════════════
@api.websocket("/ws/{user_id}")
async def presence_ws(ws: WebSocket, user_id: str):
    await presence.connect(user_id, ws)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "ping":
                    await ws.send_json({"type": "pong"})
            except:
                pass
    except WebSocketDisconnect:
        presence.disconnect(user_id)


# ══════════════════════════════════════════════════════════════════════════════
# APP SETUP
# ══════════════════════════════════════════════════════════════════════════════
app.include_router(api)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

SEEDED_PLAYERS = [
    {"username": "AceKing",    "pin": "1111", "avatar": "🦁", "avatar_color": "#c9a227", "role": "player", "chips": 10000},
    {"username": "BluffMaster","pin": "2222", "avatar": "🐺", "avatar_color": "#3b82f6", "role": "player", "chips": 10000},
    {"username": "CardShark",  "pin": "3333", "avatar": "🦊", "avatar_color": "#f97316", "role": "player", "chips": 10000},
    {"username": "PokerPro",   "pin": "4444", "avatar": "🐻", "avatar_color": "#6b4226", "role": "player", "chips": 10000},
    {"username": "AllInAndy",  "pin": "5555", "avatar": "🦅", "avatar_color": "#0891b2", "role": "player", "chips": 10000},
    {"username": "HighRoller", "pin": "6666", "avatar": "🐯", "avatar_color": "#dc2626", "role": "player", "chips": 10000},
    {"username": "TableAdmin", "pin": "0000", "avatar": "👑", "avatar_color": "#7c3aed", "role": "admin",  "chips": 999999},
]

@app.on_event("startup")
async def startup():
    for p in SEEDED_PLAYERS:
        if not await db.users.find_one({"username": p["username"]}):
            await db.users.insert_one({**p, "pin_hash": hash_pin(p["pin"]),
                                       "created_at": datetime.now(timezone.utc)})
    await db.users.create_index("username", unique=True)
    await db.hand_history.create_index("played_at")
    await db.hand_history.create_index("table_id")
    await _restore_tables()
    Path("/app/memory/test_credentials.md").write_text(
        "# Chullz Test Credentials\n\n"
        "| Username | PIN | Role |\n|---|---|---|\n"
        + "\n".join(f"| {p['username']} | {p['pin']} | {p['role']} |" for p in SEEDED_PLAYERS)
    )
    log.info("Chullz server started ✓")

@app.on_event("shutdown")
async def shutdown():
    client.close()
