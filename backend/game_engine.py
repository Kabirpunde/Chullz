"""
Chullz Game Engine
Pure functions for hand evaluation, pot-limit betting, and board scoring.
"""
import random
from itertools import combinations
from typing import List, Tuple, Dict, Optional, Any
from collections import Counter

# ── Card Constants ────────────────────────────────────────────────────────────
SUITS = ['h', 'd', 'c', 's']
RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
RANK_VAL = {r: i + 2 for i, r in enumerate(RANKS)}
RANK_DISP = {2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
             8: '8', 9: '9', 10: '10', 11: 'Jack', 12: 'Queen',
             13: 'King', 14: 'Ace', 1: 'Ace'}
RANK_SHORT = {2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7',
              8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 1: 'A'}
FULL_DECK = [r + s for r in RANKS for s in SUITS]  # 52 cards


def new_deck() -> List[str]:
    deck = FULL_DECK.copy()
    random.shuffle(deck)
    return deck


def deal(deck: List[str], n: int) -> Tuple[List[str], List[str]]:
    """Returns (dealt_cards, remaining_deck)."""
    return deck[:n], deck[n:]


def is_red(card: str) -> bool:
    return card[1] in ('h', 'd')


# ── Hand Evaluator ────────────────────────────────────────────────────────────
def _rv(card: str) -> int:
    return RANK_VAL[card[0]]


def _suit(card: str) -> str:
    return card[1]


def _poly(lst: List[int]) -> int:
    """Polynomial encoding for tiebreaking — base 15 (max rank = 14)."""
    return sum(v * (15 ** i) for i, v in enumerate(reversed(lst)))


def _eval5(cards: List[str]) -> int:
    """Score a 5-card hand. Higher = better."""
    vals = sorted([_rv(c) for c in cards], reverse=True)
    suits = [_suit(c) for c in cards]

    is_flush = len(set(suits)) == 1
    unique = sorted(set(vals))
    is_str8 = len(unique) == 5 and (unique[-1] - unique[0] == 4)
    is_wheel = set(vals) == {14, 2, 3, 4, 5}
    if is_wheel:
        is_str8 = True
        vals = [5, 4, 3, 2, 1]

    cnt = Counter(vals)
    groups = sorted(cnt.items(), key=lambda x: (x[1], x[0]), reverse=True)
    gv = [g[0] for g in groups]
    gc = [g[1] for g in groups]

    if is_str8 and is_flush:
        return 8_000_000_000 + _poly(vals)
    if gc[0] == 4:
        return 7_000_000_000 + _poly(gv)
    if gc[0] == 3 and gc[1] == 2:
        return 6_000_000_000 + _poly(gv)
    if is_flush:
        return 5_000_000_000 + _poly(vals)
    if is_str8:
        return 4_000_000_000 + _poly(vals)
    if gc[0] == 3:
        return 3_000_000_000 + _poly(gv)
    if gc[0] == 2 and gc[1] == 2:
        return 2_000_000_000 + _poly(gv)
    if gc[0] == 2:
        return 1_000_000_000 + _poly(gv)
    return _poly(vals)


def _desc5(cards: List[str]) -> str:
    """Human-readable description of a 5-card hand."""
    vals = sorted([_rv(c) for c in cards], reverse=True)
    suits = [_suit(c) for c in cards]
    is_flush = len(set(suits)) == 1
    unique = sorted(set(vals))
    is_str8 = len(unique) == 5 and (unique[-1] - unique[0] == 4)
    is_wheel = set(vals) == {14, 2, 3, 4, 5}
    if is_wheel:
        is_str8 = True
        vals = [5, 4, 3, 2, 1]

    cnt = Counter(vals)
    groups = sorted(cnt.items(), key=lambda x: (x[1], x[0]), reverse=True)
    gv = [g[0] for g in groups]
    gc = [g[1] for g in groups]

    def rn(v: int) -> str:
        return RANK_DISP.get(v, str(v))

    if is_str8 and is_flush:
        return "Royal Flush" if set(vals) == {10, 11, 12, 13, 14} else f"Straight Flush, {rn(vals[0])} high"
    if gc[0] == 4:
        return f"Four of a Kind, {rn(gv[0])}s"
    if gc[0] == 3 and gc[1] == 2:
        return f"Full House, {rn(gv[0])}s full of {rn(gv[1])}s"
    if is_flush:
        return f"Flush, {rn(vals[0])} high"
    if is_str8:
        return f"Straight, {rn(vals[0])} high"
    if gc[0] == 3:
        return f"Three of a Kind, {rn(gv[0])}s"
    if gc[0] == 2 and gc[1] == 2:
        return f"Two Pair, {rn(gv[0])}s and {rn(gv[1])}s"
    if gc[0] == 2:
        return f"Pair of {rn(gv[0])}s"
    return f"High Card {rn(vals[0])}"


def best_hand(all_cards: List[str]) -> Tuple[int, str, List[str]]:
    """Best 5-card hand from any number of cards (≥5). Returns (score, desc, best_5)."""
    if len(all_cards) < 5:
        return 0, "Incomplete", all_cards
    best_sc, best_dc, best_5 = -1, "", []
    for combo in combinations(all_cards, 5):
        sc = _eval5(list(combo))
        if sc > best_sc:
            best_sc, best_dc, best_5 = sc, _desc5(list(combo)), list(combo)
    return best_sc, best_dc, best_5


def _desc5_omaha(hole_cards: List[str], best_5: List[str]) -> str:
    """Hand description from the player's perspective.
    For flush and high-card hands, the 'high' label uses the player's highest hole card
    (since board cards are shared by all players, hole cards determine relative strength).
    All other hand types (pair, two-pair, trips, straight, full house, quads) use standard labels.
    """
    vals = sorted([_rv(c) for c in best_5], reverse=True)
    suits = [_suit(c) for c in best_5]
    is_flush = len(set(suits)) == 1
    unique = sorted(set(vals))
    is_str8 = len(unique) == 5 and (unique[-1] - unique[0] == 4)
    is_wheel = set(vals) == {14, 2, 3, 4, 5}
    if is_wheel:
        is_str8 = True
        vals = [5, 4, 3, 2, 1]

    cnt = Counter(vals)
    groups = sorted(cnt.items(), key=lambda x: (x[1], x[0]), reverse=True)
    gv = [g[0] for g in groups]
    gc = [g[1] for g in groups]

    def rn(v: int) -> str:
        return RANK_DISP.get(v, str(v))

    # For "high" descriptors: use the player's highest hole card
    hole_vals_sorted = sorted([_rv(c) for c in hole_cards], reverse=True)
    hole_high = rn(hole_vals_sorted[0])

    if is_str8 and is_flush:
        if set(vals) == {10, 11, 12, 13, 14}:
            return "Royal Flush"
        return f"Straight Flush, {hole_high} high"
    if gc[0] == 4:
        return f"Four of a Kind, {rn(gv[0])}s"
    if gc[0] == 3 and gc[1] == 2:
        return f"Full House, {rn(gv[0])}s full of {rn(gv[1])}s"
    if is_flush:
        return f"Flush, {hole_high} high"
    if is_str8:
        return f"Straight, {rn(vals[0])} high"
    if gc[0] == 3:
        return f"Three of a Kind, {rn(gv[0])}s"
    if gc[0] == 2 and gc[1] == 2:
        return f"Two Pair, {rn(gv[0])}s and {rn(gv[1])}s"
    if gc[0] == 2:
        return f"Pair of {rn(gv[0])}s"
    return f"High Card {hole_high}"


def best_hand_omaha(hole_cards: List[str], community: List[str]) -> Tuple[int, str, List[str]]:
    """Omaha-style evaluation: must use exactly BOTH hole cards + exactly 3 community cards.
    Returns (score, description, best_5_cards).
    """
    if len(hole_cards) != 2 or len(community) < 3:
        return 0, "Incomplete", hole_cards + community
    best_sc, best_dc, best_5 = -1, "", []
    for comm_combo in combinations(community, 3):
        hand = list(hole_cards) + list(comm_combo)  # exactly 5 cards
        sc = _eval5(hand)
        if sc > best_sc:
            best_sc = sc
            best_dc = _desc5_omaha(hole_cards, hand)
            best_5 = hand
    return best_sc, best_dc, best_5


# ── Pot-Limit Betting ─────────────────────────────────────────────────────────
def pl_max_raise_total(total_pot: int, current_bet: int, player_bet: int) -> int:
    """Maximum total chips a player can have bet (incl. their existing street bet)."""
    to_call = current_bet - player_bet
    pot_after_call = total_pot + to_call
    return player_bet + to_call + pot_after_call


def valid_actions(
    player_chips: int,
    player_bet: int,
    current_bet: int,
    last_raise_size: int,
    blind_big: int,
    total_pot: int,
    opp_max: Optional[int] = None,  # effective stack cap: max any opponent can commit this street
) -> Dict[str, Any]:
    """Return all valid actions and their amounts.
    opp_max: if provided, caps raises so the player cannot bet more than any opponent can call.
    """
    to_call = current_bet - player_bet
    acts: Dict[str, Any] = {"fold": True}

    if to_call == 0:
        acts["check"] = True
    if to_call > 0:
        acts["call"] = min(to_call, player_chips)

    # Raise
    max_total = pl_max_raise_total(total_pot, current_bet, player_bet)
    min_raise_add = max(last_raise_size if last_raise_size > 0 else blind_big, blind_big)
    min_total = player_bet + to_call + min_raise_add
    can_raise = player_chips > to_call and (player_bet + player_chips) >= min_total

    if can_raise:
        actual_min = min(min_total, player_bet + player_chips)
        actual_max = min(max_total, player_bet + player_chips)
        # Cap at effective stack: no point betting more than opponents can call
        if opp_max is not None:
            actual_max = min(actual_max, opp_max)

        if actual_max >= actual_min:
            def pct(p: float) -> int:
                raw = player_bet + to_call + int(total_pot * p)
                return max(min(actual_max, raw), actual_min)

            acts["raise"] = {
                "min": actual_min,
                "max": actual_max,
                "buttons": {
                    "25%":  pct(0.25),
                    "33%":  pct(0.33),
                    "50%":  pct(0.50),
                    "66%":  pct(0.66),
                    "75%":  pct(0.75),
                    "100%": actual_max,
                },
            }

    if player_chips > 0:
        all_in_total = player_bet + player_chips
        if opp_max is not None:
            all_in_total = min(all_in_total, opp_max)
        # Only show ALL IN if it commits more than a regular call
        call_total = player_bet + min(to_call, player_chips)
        if all_in_total > call_total:
            acts["all_in"] = all_in_total

    return acts


# ── Board Scoring ─────────────────────────────────────────────────────────────
def score_boards(
    community_cards: List[List[str]],   # 3 lists of 5 community cards
    assignments: Dict[str, Dict[str, List[str]]],  # {uid: {board_1:[c,c], board_2:…, board_3:…}}
    pot: int,
    total_contributions: Dict[str, int],  # uid → total chips committed this hand
) -> Dict[str, Any]:
    """Evaluate 3 boards, calculate points, distribute pot (with side pots)."""

    # Step 1: Evaluate each player's hand on each board
    results: Dict[str, Dict[str, Any]] = {}
    for uid, assign in assignments.items():
        results[uid] = {}
        for i, bk in enumerate(["board_1", "board_2", "board_3"]):
            hole = assign.get(bk, [])
            community = community_cards[i] if i < len(community_cards) else []
            # Omaha rules: must use exactly both hole cards + 3 community cards
            if len(hole) == 2 and len(community) >= 3:
                sc, desc, best5 = best_hand_omaha(hole, community)
            else:
                sc, desc, best5 = 0, "Incomplete", []
            results[uid][bk] = {
                "hole_cards": hole, "score": sc,
                "description": desc, "best_five": best5,
            }

    # Step 2: Board winners
    board_winners: Dict[str, List[str]] = {}
    for bk in ["board_1", "board_2", "board_3"]:
        if not results:
            board_winners[bk] = []
            continue
        best_sc = max(results[u][bk]["score"] for u in results)
        board_winners[bk] = [u for u in results if results[u][bk]["score"] == best_sc]

    # Step 3: Points per player
    points: Dict[str, float] = {}
    for uid in results:
        pts = sum(1.0 / len(board_winners[bk]) for bk in ["board_1", "board_2", "board_3"]
                  if uid in board_winners[bk])
        points[uid] = pts

    # Step 4: Side pots (based on total contributions)
    all_uids = list(total_contributions.keys())
    sorted_levels = sorted(set(total_contributions.values()))
    side_pots = []
    prev = 0
    remaining_players = list(all_uids)
    for level in sorted_levels:
        amt = (level - prev) * len(remaining_players)
        if amt > 0:
            side_pots.append({"amount": amt, "eligible": list(remaining_players)})
        remaining_players = [p for p in remaining_players if total_contributions[p] > level]
        prev = level

    # Step 5: Distribute each side pot to best-points player among eligible
    chips_won: Dict[str, int] = {uid: 0 for uid in all_uids}
    for sp in side_pots:
        eligible = [u for u in sp["eligible"] if u in points]
        if not eligible:
            continue
        max_pts = max(points.get(u, 0) for u in eligible)
        winners = [u for u in eligible if points.get(u, 0) == max_pts]
        per_winner = sp["amount"] // len(winners)
        rem = sp["amount"] % len(winners)
        for w in winners:
            chips_won[w] = chips_won.get(w, 0) + per_winner
        if rem and winners:
            chips_won[winners[0]] += rem

    return {
        "player_results": results,
        "board_winners": board_winners,
        "points": points,
        "chips_won": chips_won,
        "pot": pot,
    }


def auto_assign(hole_cards: List[str], existing: Dict[str, List[str]]) -> Dict[str, List[str]]:
    """Randomly complete any missing card assignments."""
    assigned = set(c for cards in existing.values() for c in cards)
    unassigned = [c for c in hole_cards if c not in assigned]
    random.shuffle(unassigned)
    result = {bk: list(existing.get(bk, [])) for bk in ["board_1", "board_2", "board_3"]}
    for bk in ["board_1", "board_2", "board_3"]:
        while len(result[bk]) < 2 and unassigned:
            result[bk].append(unassigned.pop(0))
    return result
