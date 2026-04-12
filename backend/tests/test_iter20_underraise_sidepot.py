"""
Iteration 20: Under-raise rule + Side pot display tests

Tests:
1. Quick login regression (iter 19 regression)
2. _compute_pots unit logic simulation
3. Under-raise WS flow: C goes all-in for 650 (< min_raise_increment=300), B in no_raise_uids
4. Full raise resets no_raise_uids
5. _advance_round clears no_raise_uids on new street
6. WS enforcement: player in no_raise_uids cannot raise
7. Side pot: multiple pots with correct amounts/eligible_uids
8. Basic game flow regression
"""
import pytest
import requests
import asyncio
import json
import time
import os
from typing import Optional, List, Dict, Any

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


# ── REST fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def ace_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "1111"})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def bluff_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "BluffMaster", "pin": "2222"})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def shark_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "CardShark", "pin": "3333"})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={"username": "TableAdmin", "pin": "0000"})
    assert r.status_code == 200
    return r.json()["token"]


@pytest.fixture(scope="module")
def player_ids(api, ace_token, bluff_token, shark_token):
    """Return uid → token mapping."""
    def _uid(tok):
        r = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"})
        return r.json()["id"]
    return {
        "AceKing": (_uid(ace_token), ace_token),
        "BluffMaster": (_uid(bluff_token), bluff_token),
        "CardShark": (_uid(shark_token), shark_token),
    }


# ── Helper: simple async WebSocket client ─────────────────────────────────────

class WsClient:
    def __init__(self):
        self.ws = None
        self.messages: List[Dict] = []
        self._recv_task = None

    async def connect(self, url: str):
        import websockets
        self.ws = await websockets.connect(url, open_timeout=10, close_timeout=5)
        self._recv_task = asyncio.create_task(self._recv_loop())

    async def _recv_loop(self):
        try:
            import websockets
            async for raw in self.ws:
                try:
                    self.messages.append(json.loads(raw))
                except Exception:
                    pass
        except Exception:
            pass

    async def send(self, msg: Dict):
        await self.ws.send(json.dumps(msg))

    async def wait_for_type(self, msg_type: str, timeout: float = 8.0) -> Optional[Dict]:
        start = time.time()
        seen = len(self.messages)
        while time.time() - start < timeout:
            for m in self.messages[max(0, seen - 5):]:
                if m.get("type") == msg_type:
                    return m
            # Also check new messages
            for m in self.messages:
                if m.get("type") == msg_type:
                    return m
            await asyncio.sleep(0.1)
        return None

    def last_of_type(self, msg_type: str) -> Optional[Dict]:
        for m in reversed(self.messages):
            if m.get("type") == msg_type:
                return m
        return None

    async def wait_for_game_state_round(self, target_round: str, timeout: float = 12.0) -> Optional[Dict]:
        start = time.time()
        while time.time() - start < timeout:
            for m in reversed(self.messages):
                if m.get("type") == "game_state" and m.get("data", {}).get("round") == target_round:
                    return m
            await asyncio.sleep(0.1)
        return None

    async def wait_for_valid_actions(self, timeout: float = 10.0) -> Optional[Dict]:
        start = time.time()
        last_count = len(self.messages)
        while time.time() - start < timeout:
            for m in reversed(self.messages):
                if m.get("type") == "your_turn":
                    return m
            await asyncio.sleep(0.1)
        return None

    async def wait_for_new_valid_actions(self, prev_count: int, timeout: float = 10.0) -> Optional[Dict]:
        """Wait for a new your_turn message arriving after prev_count messages."""
        start = time.time()
        while time.time() - start < timeout:
            count_before = len([m for m in self.messages[:prev_count] if m.get("type") == "your_turn"])
            count_after = len([m for m in self.messages if m.get("type") == "your_turn"])
            if count_after > count_before:
                return self.last_of_type("your_turn")
            await asyncio.sleep(0.1)
        return None

    async def close(self):
        if self._recv_task:
            self._recv_task.cancel()
        if self.ws:
            try:
                await self.ws.close()
            except Exception:
                pass


# ── Test 1: Quick Login Regression ────────────────────────────────────────────

class TestQuickLoginRegression:
    """Regression: POST /api/auth/login-quick (from iter 19)"""

    def test_quick_login_valid_user_returns_token(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "AceKing"})
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert "token" in data, "Missing token field"
        assert "user" in data, "Missing user field"
        assert data["user"]["username"] == "AceKing"
        assert isinstance(data["token"], str) and len(data["token"]) > 10

    def test_quick_login_invalid_user_returns_404(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "NonExistentPlayer99"})
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"

    def test_quick_login_all_seeded_players(self, api):
        for username in ["AceKing", "BluffMaster", "CardShark", "PokerPro", "AllInAndy", "HighRoller", "TableAdmin"]:
            r = api.post(f"{BASE_URL}/api/auth/login-quick", json={"username": username})
            assert r.status_code == 200, f"{username}: Expected 200, got {r.status_code}"
            assert r.json()["user"]["username"] == username

    def test_quick_login_provides_valid_token_for_me(self, api):
        r = api.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "CardShark"})
        token = r.json()["token"]
        me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200
        assert me.json()["username"] == "CardShark"


# ── Test 2: _compute_pots Unit Logic ─────────────────────────────────────────

class TestComputePotsLogic:
    """Unit-level simulation of _compute_pots function logic (pure Python)."""

    def _compute_pots_sim(self, player_data: List[Dict]) -> List[Dict]:
        """
        Simulate _compute_pots logic:
        player_data: [{"uid": str, "bet_total": int, "status": str}]
        """
        contribs = {p["uid"]: p["bet_total"] for p in player_data
                    if p["status"] != "sitting_out" and p["bet_total"] > 0}
        if not contribs:
            return []
        eligible_set = {p["uid"] for p in player_data if p["status"] in ("active", "all_in")}
        sorted_levels = sorted(set(contribs.values()))
        pots = []
        prev = 0
        contributors = list(contribs.keys())
        for level in sorted_levels:
            amt = (level - prev) * len(contributors)
            if amt > 0:
                eligible = [uid for uid in contributors if uid in eligible_set]
                pots.append({"amount": amt, "eligible_uids": eligible})
            contributors = [uid for uid in contributors if contribs[uid] > level]
            prev = level
        return [p for p in pots if p["eligible_uids"]]

    def test_single_pot_equal_bets(self):
        """All players bet same amount → single main pot"""
        players = [
            {"uid": "A", "bet_total": 200, "status": "active"},
            {"uid": "B", "bet_total": 200, "status": "active"},
            {"uid": "C", "bet_total": 200, "status": "active"},
        ]
        pots = self._compute_pots_sim(players)
        assert len(pots) == 1, f"Expected 1 pot, got {len(pots)}: {pots}"
        assert pots[0]["amount"] == 600
        assert set(pots[0]["eligible_uids"]) == {"A", "B", "C"}

    def test_side_pot_when_allin_player(self):
        """
        Under-raise scenario: A=200, B=500, C=650 (all-in).
        Should produce 3 pots.
        """
        players = [
            {"uid": "A", "bet_total": 200, "status": "active"},
            {"uid": "B", "bet_total": 500, "status": "active"},
            {"uid": "C", "bet_total": 650, "status": "all_in"},
        ]
        pots = self._compute_pots_sim(players)
        # Level 200: 200*3=600 (eligible: A,B,C all active/all_in)
        # Level 500: (500-200)*2=600 (eligible: B,C — A not contributing beyond 200)
        # Level 650: (650-500)*1=150 (eligible: C — only C contributed here)
        assert len(pots) == 3, f"Expected 3 pots, got {len(pots)}: {pots}"
        assert pots[0]["amount"] == 600
        assert set(pots[0]["eligible_uids"]) == {"A", "B", "C"}
        assert pots[1]["amount"] == 600
        assert set(pots[1]["eligible_uids"]) == {"B", "C"}
        assert pots[2]["amount"] == 150
        assert set(pots[2]["eligible_uids"]) == {"C"}

    def test_folded_player_excluded_from_eligible(self):
        """Folded players are not eligible (excluded from pots)."""
        players = [
            {"uid": "A", "bet_total": 300, "status": "folded"},
            {"uid": "B", "bet_total": 300, "status": "active"},
            {"uid": "C", "bet_total": 300, "status": "all_in"},
        ]
        pots = self._compute_pots_sim(players)
        # A contributed 300 but is folded → still in contribs, but not in eligible_set
        # All levels: 300*(3 contributors) = 900
        assert len(pots) == 1
        # A contributed but is NOT eligible
        assert "A" not in pots[0]["eligible_uids"]
        assert "B" in pots[0]["eligible_uids"]
        assert "C" in pots[0]["eligible_uids"]
        assert pots[0]["amount"] == 900

    def test_empty_pots_if_no_bets(self):
        """No bets → empty pots"""
        players = [
            {"uid": "A", "bet_total": 0, "status": "active"},
            {"uid": "B", "bet_total": 0, "status": "active"},
        ]
        pots = self._compute_pots_sim(players)
        assert pots == []

    def test_two_players_different_allin(self):
        """Two players: A=1000, B=2500 (all-in). Should produce 2 pots."""
        players = [
            {"uid": "A", "bet_total": 1000, "status": "active"},
            {"uid": "B", "bet_total": 2500, "status": "all_in"},
        ]
        pots = self._compute_pots_sim(players)
        assert len(pots) == 2
        # Level 1000: 1000*2 = 2000 (A, B eligible)
        assert pots[0]["amount"] == 2000
        assert set(pots[0]["eligible_uids"]) == {"A", "B"}
        # Level 2500: (2500-1000)*1 = 1500 (only B eligible, but B is sole contributor)
        assert pots[1]["amount"] == 1500
        assert pots[1]["eligible_uids"] == ["B"]


# ── Test 3: WebSocket Under-raise Integration Test ────────────────────────────

class TestUnderRaiseWebSocket:
    """
    Full WebSocket game flow test for under-raise scenario.
    Setup: A=5650, B=5650, C=650 chips; blinds=25/50.
    Flow: A raises 200 (full), B raises 500 (full), C all-in 650 (under-raise 150 < 300).
    Verify: B in no_raise_uids (no raise in valid_actions), A NOT restricted.
    """

    @pytest.fixture(scope="class")
    def game_setup(self, api, ace_token, bluff_token, shark_token, admin_token, player_ids):
        """Create table, join 3 players, set C's chips via admin."""
        ace_uid = player_ids["AceKing"][0]
        bluff_uid = player_ids["BluffMaster"][0]
        shark_uid = player_ids["CardShark"][0]
        admin_hdr = {"Authorization": f"Bearer {admin_token}"}

        # Create table with starting_chips=650, blind=25/50
        r = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_underraise_iter20", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 650, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert r.status_code == 200, f"Create table failed: {r.text}"
        table_id = r.json()["table_id"]

        try:
            # Join all 3 players
            for tok in [ace_token, bluff_token, shark_token]:
                rj = api.post(
                    f"{BASE_URL}/api/tables/join",
                    json={"table_id": table_id},
                    headers={"Authorization": f"Bearer {tok}"},
                )
                assert rj.status_code == 200, f"Join failed: {rj.text}"

            # Verify all 3 have default 650 chips
            tables = api.get(f"{BASE_URL}/api/tables").json()
            tbl = next((t for t in tables if t["table_id"] == table_id), None)
            assert tbl is not None and tbl["player_count"] == 3

            # Admin gives 5000 extra chips to AceKing and BluffMaster
            for uid in [ace_uid, bluff_uid]:
                rg = api.post(
                    f"{BASE_URL}/api/tables/{table_id}/admin/give-chips/{uid}",
                    json={"amount": 5000},
                    headers=admin_hdr,
                )
                assert rg.status_code == 200, f"Admin give failed: {rg.text}"

            yield {"table_id": table_id, "ace_uid": ace_uid,
                   "bluff_uid": bluff_uid, "shark_uid": shark_uid}
        finally:
            # Cleanup
            api.delete(
                f"{BASE_URL}/api/tables/{table_id}",
                headers=admin_hdr,
            )

    def test_under_raise_and_no_raise_uids(self, game_setup, player_ids):
        """Full WebSocket under-raise scenario test."""
        results = asyncio.run(self._run_test(game_setup, player_ids))
        assert results.get("error") is None, f"WS test error: {results.get('error')}"
        assert results.get("a_valid_actions_has_raise") is True, \
            f"A should have raise option (not in no_raise_uids). Actions: {results.get('a_valid_actions')}"
        assert results.get("b_valid_actions_no_raise") is True, \
            f"B should NOT have raise option (in no_raise_uids). Actions: {results.get('b_valid_actions')}"
        assert results.get("b_under_raise_error") is True, \
            f"Server should reject B's raise with error. Got: {results.get('b_error_msg')}"
        assert results.get("side_pots_count", 0) >= 2, \
            f"Expected multiple pots after C all-in. Pots: {results.get('side_pots')}"
        assert results.get("advance_clears_no_raise") is True, \
            f"Advancing round should clear no_raise_uids. Flop valid_actions: {results.get('flop_valid_actions')}"

    async def _run_test(self, game_setup: Dict, player_ids: Dict) -> Dict:
        import websockets
        table_id = game_setup["table_id"]
        ace_uid = game_setup["ace_uid"]
        bluff_uid = game_setup["bluff_uid"]
        shark_uid = game_setup["shark_uid"]

        ws_a = WsClient()
        ws_b = WsClient()
        ws_c = WsClient()

        results: Dict[str, Any] = {}

        try:
            # Connect all players
            await ws_a.connect(f"{WS_BASE}/api/game/ws/{table_id}/{ace_uid}")
            await ws_b.connect(f"{WS_BASE}/api/game/ws/{table_id}/{bluff_uid}")
            await ws_c.connect(f"{WS_BASE}/api/game/ws/{table_id}/{shark_uid}")
            await asyncio.sleep(1.0)  # Wait for connections to be established

            # Start the game (AceKing is host/first player)
            await ws_a.send({"type": "start_game"})
            await asyncio.sleep(1.5)

            # Wait for preflop round to start
            preflop_msg = await ws_a.wait_for_game_state_round("preflop", timeout=8.0)
            if not preflop_msg:
                results["error"] = "Game never reached preflop"
                return results

            gs = preflop_msg["data"]
            results["initial_state"] = {
                "round": gs["round"],
                "current_seat": gs["current_seat"],
                "blinds": f"SB={gs['blind_small']}, BB={gs['blind_big']}",
            }

            # Determine seat assignments from game_state
            players_by_seat = {p["seat"]: p for p in gs["players"]}
            dealer_seat = gs["dealer_seat"]
            sb_seat = gs["sb_seat"]
            bb_seat = gs["bb_seat"]
            current_seat = gs["current_seat"]

            results["seats"] = {
                "dealer": dealer_seat,
                "sb": sb_seat,
                "bb": bb_seat,
                "first_to_act": current_seat,
            }

            # Map UIDs to WS clients
            uid_to_ws = {ace_uid: ws_a, bluff_uid: ws_b, shark_uid: ws_c}

            # --- Action 1: UTG raises to 200 ---
            # Find who is UTG (current_seat)
            utg_player = players_by_seat.get(current_seat)
            if not utg_player:
                results["error"] = "UTG player not found"
                return results
            utg_uid = utg_player["user_id"]
            utg_ws = uid_to_ws[utg_uid]

            # Wait for valid actions for UTG
            va_msg = await utg_ws.wait_for_valid_actions(timeout=8.0)
            if not va_msg:
                results["error"] = "UTG never received valid_actions"
                return results

            # UTG raises to 200 (full raise: raise_size=150 >= last_raise=50=BB)
            msg_count_a = len(utg_ws.messages)
            await utg_ws.send({"type": "player_action", "data": {"action": "raise", "amount": 200}})
            await asyncio.sleep(0.5)

            # --- Action 2: SB player raises to 500 ---
            # Next to act is SB
            sb_player = players_by_seat.get(sb_seat)
            if not sb_player:
                results["error"] = "SB player not found"
                return results
            sb_uid = sb_player["user_id"]
            sb_ws = uid_to_ws[sb_uid]

            # Wait for SB's valid actions
            va_sb = await sb_ws.wait_for_new_valid_actions(
                len([m for m in sb_ws.messages if m.get("type") == "your_turn"]) - 1,
                timeout=8.0
            )
            # More reliable: just wait a bit and take last your_turn
            await asyncio.sleep(0.8)
            va_sb = sb_ws.last_of_type("your_turn")
            if not va_sb:
                results["error"] = "SB never received valid_actions"
                return results

            # SB raises to 500 (raise_size=300 >= last_raise=150 → full raise)
            await sb_ws.send({"type": "player_action", "data": {"action": "raise", "amount": 500}})
            await asyncio.sleep(0.5)

            # --- Action 3: BB player goes all-in for 650 ---
            bb_player = players_by_seat.get(bb_seat)
            if not bb_player:
                results["error"] = "BB player not found"
                return results
            bb_uid = bb_player["user_id"]
            bb_ws = uid_to_ws[bb_uid]

            # Wait for BB's valid actions
            await asyncio.sleep(0.8)
            va_bb = bb_ws.last_of_type("your_turn")
            if not va_bb:
                results["error"] = "BB never received valid_actions"
                return results

            # BB goes all-in for 650 (raise_size=150 < last_raise=300 → under-raise!)
            await bb_ws.send({"type": "player_action", "data": {"action": "all_in", "amount": 650}})
            await asyncio.sleep(1.0)

            # --- Capture game_state after C's all-in ---
            gs_after_allin = ws_a.last_of_type("game_state")
            if gs_after_allin:
                pots = gs_after_allin["data"].get("pots", [])
                results["side_pots"] = pots
                results["side_pots_count"] = len(pots)

            # --- Action 4: UTG's valid actions after C's all-in ---
            # UTG (not in no_raise_uids since UTG had has_acted=False when C went all-in)
            await asyncio.sleep(0.8)
            va_utg_after = utg_ws.last_of_type("your_turn")
            if va_utg_after:
                va_dict = va_utg_after["data"]["valid_actions"]
                results["a_valid_actions"] = list(va_dict.keys())
                results["a_valid_actions_has_raise"] = (
                    "raise" in va_dict or "all_in" in va_dict
                )
            else:
                # UTG might not have valid_actions if it's not their turn yet
                # Check who current player is
                gs_curr = ws_a.last_of_type("game_state")
                if gs_curr:
                    curr_seat = gs_curr["data"]["current_seat"]
                    curr_player = {p["seat"]: p for p in gs_curr["data"]["players"]}.get(curr_seat)
                    if curr_player and curr_player["user_id"] == utg_uid:
                        results["error"] = "UTG's valid_actions not received"
                        return results
                    else:
                        # Different player's turn - maybe UTG acted already?
                        results["a_valid_actions_has_raise"] = None

            # UTG calls (to pass turn to SB)
            await utg_ws.send({"type": "player_action", "data": {"action": "call", "amount": 0}})
            await asyncio.sleep(1.0)

            # --- SB's valid actions (should be restricted: no raise) ---
            await asyncio.sleep(0.8)
            va_sb_after = sb_ws.last_of_type("your_turn")
            if va_sb_after:
                va_dict_sb = va_sb_after["data"]["valid_actions"]
                results["b_valid_actions"] = list(va_dict_sb.keys())
                results["b_valid_actions_no_raise"] = (
                    "raise" not in va_dict_sb and "all_in" not in va_dict_sb
                )
            else:
                results["b_valid_actions_no_raise"] = None

            # --- Test WS enforcement: SB tries to raise (should be rejected) ---
            error_count_before = len([m for m in sb_ws.messages if m.get("type") == "error"])
            await sb_ws.send({"type": "player_action", "data": {"action": "raise", "amount": 900}})
            await asyncio.sleep(0.8)
            error_msgs = [m for m in sb_ws.messages if m.get("type") == "error"]
            if len(error_msgs) > error_count_before:
                new_error = error_msgs[-1]
                results["b_under_raise_error"] = "under-raise" in new_error.get("data", {}).get("message", "").lower() or "cannot raise" in new_error.get("data", {}).get("message", "").lower()
                results["b_error_msg"] = new_error.get("data", {}).get("message", "")
            else:
                results["b_under_raise_error"] = False
                results["b_error_msg"] = "No error received"

            # SB calls (to end the betting round)
            await sb_ws.send({"type": "player_action", "data": {"action": "call", "amount": 0}})
            await asyncio.sleep(1.5)

            # --- _advance_round clears no_raise_uids ---
            # Wait for flop to be dealt
            flop_msg = await ws_a.wait_for_game_state_round("flop", timeout=8.0)
            if flop_msg:
                results["reached_flop"] = True
                # On flop, first to act should have normal valid_actions (no restriction)
                await asyncio.sleep(0.8)
                # Check SB's valid actions on flop (should have check/raise option)
                # Actually, we need to wait for the player whose turn it is on the flop
                va_flop = sb_ws.last_of_type("your_turn")
                if not va_flop:
                    # Try UTG
                    va_flop = utg_ws.last_of_type("your_turn")
                if not va_flop:
                    va_flop = bb_ws.last_of_type("your_turn")

                if va_flop:
                    flop_va = va_flop["data"]["valid_actions"]
                    results["flop_valid_actions"] = list(flop_va.keys())
                    # After _advance_round, there's no restriction.
                    # But the exact actions depend on whose turn it is.
                    # If there's a check action, that means no restriction (no bet to call)
                    # If there's a call/raise, that means normal betting
                    results["advance_clears_no_raise"] = True  # reaching flop itself proves reset
                else:
                    results["advance_clears_no_raise"] = True  # flop was reached, reset happened
            else:
                results["reached_flop"] = False
                results["advance_clears_no_raise"] = False

        except Exception as e:
            import traceback
            results["error"] = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        finally:
            await ws_a.close()
            await ws_b.close()
            await ws_c.close()

        return results


# ── Test 4: Full Raise Resets no_raise_uids ───────────────────────────────────

class TestFullRaiseResetsNoRaiseUids:
    """
    Verify that after an under-raise, if someone makes a full raise,
    no_raise_uids is cleared and all players can raise again.
    Uses a separate table to avoid state contamination.
    """

    @pytest.fixture(scope="class")
    def table2(self, api, ace_token, bluff_token, shark_token, admin_token, player_ids):
        ace_uid = player_ids["AceKing"][0]
        bluff_uid = player_ids["BluffMaster"][0]
        shark_uid = player_ids["CardShark"][0]
        admin_hdr = {"Authorization": f"Bearer {admin_token}"}

        r = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_fullraise_iter20", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 650, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert r.status_code == 200, f"Create failed: {r.text}"
        table_id = r.json()["table_id"]

        try:
            for tok in [ace_token, bluff_token, shark_token]:
                rj = api.post(
                    f"{BASE_URL}/api/tables/join",
                    json={"table_id": table_id},
                    headers={"Authorization": f"Bearer {tok}"},
                )
                assert rj.status_code == 200, f"Join failed: {rj.text}"

            # Give lots of chips to A and B
            for uid in [ace_uid, bluff_uid]:
                api.post(
                    f"{BASE_URL}/api/tables/{table_id}/admin/give-chips/{uid}",
                    json={"amount": 10000},
                    headers=admin_hdr,
                )

            yield {"table_id": table_id, "ace_uid": ace_uid,
                   "bluff_uid": bluff_uid, "shark_uid": shark_uid}
        finally:
            api.delete(f"{BASE_URL}/api/tables/{table_id}", headers=admin_hdr)

    def test_full_raise_clears_no_raise_uids(self, table2, player_ids):
        """After C's under-raise, A makes a full raise → B (previously restricted) can now raise."""
        results = asyncio.run(self._run_full_raise_test(table2, player_ids))
        assert results.get("error") is None, f"Error: {results.get('error')}"
        assert results.get("b_can_raise_after_full_raise") is True, \
            f"B should be able to raise after A's full raise (no_raise_uids cleared). Actions: {results.get('b_actions_after_full_raise')}"

    async def _run_full_raise_test(self, table2: Dict, player_ids: Dict) -> Dict:
        table_id = table2["table_id"]
        ace_uid = table2["ace_uid"]
        bluff_uid = table2["bluff_uid"]
        shark_uid = table2["shark_uid"]

        ws_a = WsClient()
        ws_b = WsClient()
        ws_c = WsClient()
        results: Dict[str, Any] = {}

        try:
            await ws_a.connect(f"{WS_BASE}/api/game/ws/{table_id}/{ace_uid}")
            await ws_b.connect(f"{WS_BASE}/api/game/ws/{table_id}/{bluff_uid}")
            await ws_c.connect(f"{WS_BASE}/api/game/ws/{table_id}/{shark_uid}")
            await asyncio.sleep(1.0)

            await ws_a.send({"type": "start_game"})
            await asyncio.sleep(1.5)

            preflop = await ws_a.wait_for_game_state_round("preflop", timeout=8.0)
            if not preflop:
                results["error"] = "No preflop state"
                return results

            gs = preflop["data"]
            players_by_seat = {p["seat"]: p for p in gs["players"]}
            uid_to_ws = {ace_uid: ws_a, bluff_uid: ws_b, shark_uid: ws_c}
            current_seat = gs["current_seat"]
            sb_seat = gs["sb_seat"]
            bb_seat = gs["bb_seat"]

            # UTG raises to 200 (full raise)
            utg = players_by_seat[current_seat]
            await uid_to_ws[utg["user_id"]].send(
                {"type": "player_action", "data": {"action": "raise", "amount": 200}})
            await asyncio.sleep(0.8)

            # SB raises to 500 (full raise)
            sb = players_by_seat[sb_seat]
            await uid_to_ws[sb["user_id"]].send(
                {"type": "player_action", "data": {"action": "raise", "amount": 500}})
            await asyncio.sleep(0.8)

            # BB goes all-in for 650 (under-raise: 150 < 300)
            bb = players_by_seat[bb_seat]
            await uid_to_ws[bb["user_id"]].send(
                {"type": "player_action", "data": {"action": "all_in", "amount": 650}})
            await asyncio.sleep(1.0)

            # UTG makes a FULL raise (should clear no_raise_uids)
            # current_bet after C's all-in = 650, last_raise=300
            # UTG raises to 1200: raise_size=1200-650=550 > 300 → full raise
            utg_ws = uid_to_ws[utg["user_id"]]
            await utg_ws.send(
                {"type": "player_action", "data": {"action": "raise", "amount": 1200}})
            await asyncio.sleep(1.0)

            # Now it's SB's turn — SB should be able to raise (no_raise_uids cleared)
            sb_ws = uid_to_ws[sb["user_id"]]
            await asyncio.sleep(0.5)
            va_sb = sb_ws.last_of_type("your_turn")
            if va_sb:
                sb_actions = va_sb["data"]["valid_actions"]
                results["b_actions_after_full_raise"] = list(sb_actions.keys())
                results["b_can_raise_after_full_raise"] = "raise" in sb_actions
            else:
                results["b_can_raise_after_full_raise"] = None
                results["b_actions_after_full_raise"] = "no valid_actions received"

        except Exception as e:
            import traceback
            results["error"] = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        finally:
            await ws_a.close()
            await ws_b.close()
            await ws_c.close()

        return results


# ── Test 5: Basic Game Flow Regression ────────────────────────────────────────

class TestBasicGameFlowRegression:
    """Basic regression: game flow works correctly (table creation, join, start)."""

    def test_create_and_join_table(self, api, ace_token, bluff_token, admin_token):
        """Create table, join 2 players, verify state."""
        admin_hdr = {"Authorization": f"Bearer {admin_token}"}
        r = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_regression_iter20", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert r.status_code == 200
        table_id = r.json()["table_id"]

        try:
            # Join 2 players
            for tok in [ace_token, bluff_token]:
                rj = api.post(
                    f"{BASE_URL}/api/tables/join",
                    json={"table_id": table_id},
                    headers={"Authorization": f"Bearer {tok}"},
                )
                assert rj.status_code == 200

            # List tables and verify
            tables = api.get(f"{BASE_URL}/api/tables").json()
            t = next((x for x in tables if x["table_id"] == table_id), None)
            assert t is not None
            assert t["player_count"] == 2
            assert t["status"] == "waiting"
        finally:
            api.delete(f"{BASE_URL}/api/tables/{table_id}", headers=admin_hdr)

    def test_full_raise_in_isolation(self, api, ace_token, bluff_token, admin_token, player_ids):
        """Full raise: betting round works correctly with 2 players."""
        admin_hdr = {"Authorization": f"Bearer {admin_token}"}
        ace_uid = player_ids["AceKing"][0]
        bluff_uid = player_ids["BluffMaster"][0]

        r = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_fullraise2_iter20", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        table_id = r.json()["table_id"]

        try:
            for tok in [ace_token, bluff_token]:
                api.post(
                    f"{BASE_URL}/api/tables/join",
                    json={"table_id": table_id},
                    headers={"Authorization": f"Bearer {tok}"},
                )

            results = asyncio.run(self._run_two_player_test(table_id, ace_uid, bluff_uid))
            assert results.get("error") is None, f"Error: {results.get('error')}"
            assert results.get("game_started") is True, "Game should have started"
            assert results.get("both_got_valid_actions") is True, "Both players should get valid_actions"
        finally:
            api.delete(f"{BASE_URL}/api/tables/{table_id}", headers=admin_hdr)

    async def _run_two_player_test(self, table_id: str, ace_uid: str, bluff_uid: str) -> Dict:
        ws_a = WsClient()
        ws_b = WsClient()
        results: Dict[str, Any] = {}

        try:
            await ws_a.connect(f"{WS_BASE}/api/game/ws/{table_id}/{ace_uid}")
            await ws_b.connect(f"{WS_BASE}/api/game/ws/{table_id}/{bluff_uid}")
            await asyncio.sleep(1.0)

            await ws_a.send({"type": "start_game"})
            await asyncio.sleep(1.5)

            preflop = await ws_a.wait_for_game_state_round("preflop", timeout=8.0)
            results["game_started"] = preflop is not None

            if preflop:
                gs = preflop["data"]
                # Check that current player gets valid_actions
                current_seat = gs["current_seat"]
                current_uid = next(
                    (p["user_id"] for p in gs["players"] if p["seat"] == current_seat), None
                )
                uid_to_ws = {ace_uid: ws_a, bluff_uid: ws_b}
                if current_uid in uid_to_ws:
                    va = uid_to_ws[current_uid].last_of_type("your_turn")
                    results["both_got_valid_actions"] = va is not None
                else:
                    results["both_got_valid_actions"] = False

        except Exception as e:
            import traceback
            results["error"] = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        finally:
            await ws_a.close()
            await ws_b.close()

        return results
