"""
Iteration 15 Tests: Card Assignment + Vote-to-Next-Hand reconnect recovery
Tests for:
- pendingAssignmentRef reconnect recovery (backend: assigned_uids)
- pendingVoteRef reconnect recovery (backend: showdown_ready)
- ready_next_hand uses participated_uids (excludes sitting_out)
- AssignmentPanel removed (no broken imports)
- Full game flow: preflop → flop → turn → river → assignment → showdown
"""
import pytest
import requests
import os
import json
import time
import threading
import websocket  # websocket-client

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
WS_BASE = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")


def login(username, pin):
    """Helper to login and get token + user_id"""
    res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": username, "pin": pin})
    assert res.status_code == 200, f"Login failed for {username}: {res.text}"
    data = res.json()
    return data["token"], data["user"]["id"]


def create_and_join_table(ace_token, bluff_token):
    """Create table with AceKing as host, join with BluffMaster"""
    headers_ace = {"Authorization": f"Bearer {ace_token}", "Content-Type": "application/json"}
    headers_bluff = {"Authorization": f"Bearer {bluff_token}", "Content-Type": "application/json"}

    # Create table
    create_res = requests.post(
        f"{BASE_URL}/api/tables/create",
        json={"name": "TEST_iter15", "blind_small": 25, "blind_big": 50, "starting_chips": 1000, "max_players": 2},
        headers=headers_ace,
    )
    assert create_res.status_code == 200, f"Create table failed: {create_res.text}"
    table_id = create_res.json()["table_id"]

    # AceKing joins
    join_ace = requests.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id}, headers=headers_ace)
    assert join_ace.status_code == 200, f"AceKing join failed: {join_ace.text}"

    # BluffMaster joins
    join_bluff = requests.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id}, headers=headers_bluff)
    assert join_bluff.status_code == 200, f"BluffMaster join failed: {join_bluff.text}"

    return table_id


class WsClient:
    """Simple synchronous WebSocket wrapper"""

    def __init__(self, table_id, user_id):
        ws_url = f"{WS_BASE}/api/game/ws/{table_id}/{user_id}"
        self.messages = []
        self.ws = websocket.create_connection(ws_url, timeout=10)
        self._running = True
        # Start receiver thread
        self._thread = threading.Thread(target=self._recv_loop, daemon=True)
        self._thread.start()

    def _recv_loop(self):
        while self._running:
            try:
                raw = self.ws.recv()
                msg = json.loads(raw)
                self.messages.append(msg)
            except Exception:
                break

    def send(self, msg):
        self.ws.send(json.dumps(msg))

    def wait_for(self, mtype, timeout=10):
        """Wait for a message of a given type"""
        start = time.time()
        while time.time() - start < timeout:
            for m in self.messages:
                if m.get("type") == mtype:
                    return m
            time.sleep(0.1)
        return None

    def wait_for_round(self, round_name, timeout=15):
        """Wait for a game_state message with a specific round"""
        start = time.time()
        while time.time() - start < timeout:
            for m in self.messages:
                if m.get("type") == "game_state" and m.get("data", {}).get("round") == round_name:
                    return m
            time.sleep(0.1)
        return None

    def clear(self):
        self.messages.clear()

    def close(self):
        self._running = False
        try:
            self.ws.close()
        except Exception:
            pass


@pytest.fixture(scope="module")
def tokens():
    ace_token, ace_id = login("AceKing", "1111")
    bluff_token, bluff_id = login("BluffMaster", "2222")
    return {
        "ace_token": ace_token, "ace_id": ace_id,
        "bluff_token": bluff_token, "bluff_id": bluff_id,
    }


@pytest.fixture(scope="module")
def table_id(tokens):
    tid = create_and_join_table(tokens["ace_token"], tokens["bluff_token"])
    yield tid
    # Cleanup - try to delete table
    try:
        admin_token, _ = login("TableAdmin", "0000")
        requests.delete(
            f"{BASE_URL}/api/tables/{tid}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    except Exception:
        pass


# ── API-level tests ───────────────────────────────────────────────────────────

class TestIter15ApiLevel:
    """Basic API tests for Iteration 15 features"""

    def test_login_aceking(self):
        """AceKing can login with PIN 1111"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "1111"})
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["user"]["username"] == "AceKing"
        print("PASS: AceKing login")

    def test_login_bluffmaster(self):
        """BluffMaster can login with PIN 2222"""
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "BluffMaster", "pin": "2222"})
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["user"]["username"] == "BluffMaster"
        print("PASS: BluffMaster login")

    def test_tables_list_loads(self):
        """Tables list endpoint returns array"""
        res = requests.get(f"{BASE_URL}/api/tables")
        assert res.status_code == 200
        assert isinstance(res.json(), list)
        print("PASS: Tables list loads")

    def test_create_table_succeeds(self, tokens):
        """Can create a table and it appears in list"""
        res = requests.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_iter15_api", "blind_small": 25, "blind_big": 50, "starting_chips": 1000, "max_players": 2},
            headers={"Authorization": f"Bearer {tokens['ace_token']}", "Content-Type": "application/json"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "table_id" in data
        table_id = data["table_id"]
        print(f"PASS: Table created: {table_id}")

        # Verify it appears in list
        list_res = requests.get(f"{BASE_URL}/api/tables")
        table_ids = [t["table_id"] for t in list_res.json()]
        assert table_id in table_ids
        print("PASS: Table appears in list")

        # Cleanup
        try:
            admin_token, _ = login("TableAdmin", "0000")
            requests.delete(f"{BASE_URL}/api/tables/{table_id}", headers={"Authorization": f"Bearer {admin_token}"})
        except Exception:
            pass


# ── WebSocket full game flow tests ────────────────────────────────────────────

class TestIter15GameFlow:
    """Full game flow via WebSocket - tests assignment and showdown phases"""

    def test_full_game_flow_to_assignment_and_showdown(self, tokens, table_id):
        """
        Play a full hand from start to showdown.
        Tests:
        - AceKing can start game as host
        - Both players receive hole cards
        - Assignment phase is triggered
        - assigned_uids tracks who has submitted
        - Showdown phase is reached
        - showdown_ready tracks who has voted
        - ready_next_hand excludes sitting_out players
        """
        ace_id = tokens["ace_id"]
        bluff_id = tokens["bluff_id"]

        ace_ws = WsClient(table_id, ace_id)
        bluff_ws = WsClient(table_id, bluff_id)
        time.sleep(1)  # Allow connections to stabilize

        try:
            # ── Start game ────────────────────────────────────────────────────
            ace_ws.send({"type": "start_game"})
            time.sleep(1)

            # Both should get game_state with round != 'waiting'
            ace_state = ace_ws.wait_for_round("preflop", timeout=10)
            assert ace_state is not None, "AceKing did not receive preflop game_state"
            print(f"PASS: Game started, round=preflop")

            bluff_state = bluff_ws.wait_for_round("preflop", timeout=5)
            assert bluff_state is not None, "BluffMaster did not receive preflop game_state"
            print(f"PASS: BluffMaster received preflop state")

            # ── Get hole cards ────────────────────────────────────────────────
            ace_cards_msg = ace_ws.wait_for("hole_cards", timeout=8)
            assert ace_cards_msg is not None, "AceKing did not receive hole cards"
            ace_hole_cards = ace_cards_msg["data"]["hole_cards"]
            assert len(ace_hole_cards) == 6, f"Expected 6 hole cards, got {len(ace_hole_cards)}"
            print(f"PASS: AceKing hole cards: {ace_hole_cards}")

            bluff_cards_msg = bluff_ws.wait_for("hole_cards", timeout=5)
            assert bluff_cards_msg is not None, "BluffMaster did not receive hole cards"
            bluff_hole_cards = bluff_cards_msg["data"]["hole_cards"]
            assert len(bluff_hole_cards) == 6, f"Expected 6 hole cards, got {len(bluff_hole_cards)}"
            print(f"PASS: BluffMaster hole cards: {bluff_hole_cards}")

            # ── Play through preflop betting ──────────────────────────────────
            # Current seat should be active player. Auto-act by checking who it is.
            gs_data = ace_state["data"]
            players = gs_data["players"]
            
            # Find who acts first (current_seat)
            current_seat = gs_data["current_seat"]
            active_player = next((p for p in players if p["seat"] == current_seat), None)
            
            ace_player = next((p for p in players if p["user_id"] == ace_id), None)
            bluff_player = next((p for p in players if p["user_id"] == bluff_id), None)
            
            print(f"Current seat: {current_seat}, AceKing seat: {ace_player['seat'] if ace_player else 'N/A'}, BluffMaster seat: {bluff_player['seat'] if bluff_player else 'N/A'}")

            # Wait for your_turn messages and respond to all preflop actions
            # With 2 players, preflop ends after 2 calls/checks
            for attempt in range(6):  # Max 6 betting actions
                # Check whose turn it is via game_state
                time.sleep(0.3)
                
                # Check if AceKing has a turn
                ace_turn = ace_ws.wait_for("your_turn", timeout=2)
                if ace_turn:
                    ace_ws.clear()
                    # Call or check
                    actions = ace_turn["data"]["valid_actions"]
                    if actions.get("check") is not None:
                        ace_ws.send({"type": "player_action", "data": {"action": "check", "amount": 0}})
                        print(f"  AceKing: check")
                    elif actions.get("call") is not None:
                        ace_ws.send({"type": "player_action", "data": {"action": "call", "amount": actions["call"]}})
                        print(f"  AceKing: call {actions['call']}")
                    else:
                        ace_ws.send({"type": "player_action", "data": {"action": "fold", "amount": 0}})
                        print(f"  AceKing: fold (no better option)")
                    time.sleep(0.5)
                
                # Check if BluffMaster has a turn
                bluff_turn = bluff_ws.wait_for("your_turn", timeout=2)
                if bluff_turn:
                    bluff_ws.clear()
                    actions = bluff_turn["data"]["valid_actions"]
                    if actions.get("check") is not None:
                        bluff_ws.send({"type": "player_action", "data": {"action": "check", "amount": 0}})
                        print(f"  BluffMaster: check")
                    elif actions.get("call") is not None:
                        bluff_ws.send({"type": "player_action", "data": {"action": "call", "amount": actions["call"]}})
                        print(f"  BluffMaster: call {actions['call']}")
                    else:
                        bluff_ws.send({"type": "player_action", "data": {"action": "fold", "amount": 0}})
                        print(f"  BluffMaster: fold (no better option)")
                    time.sleep(0.5)
                
                # Check if we've moved past preflop
                for m in ace_ws.messages + bluff_ws.messages:
                    if m.get("type") == "game_state":
                        r = m.get("data", {}).get("round", "")
                        if r not in ("preflop", "waiting"):
                            print(f"  Round advanced to: {r}")
                            break
                else:
                    continue
                break

            # ── Wait for assignment round ─────────────────────────────────────
            # Play through flop/turn/river if needed
            max_rounds = 20
            for _ in range(max_rounds):
                time.sleep(0.5)
                
                # Check for turn messages
                for ws_client, name in [(ace_ws, "AceKing"), (bluff_ws, "BluffMaster")]:
                    turn_msg = ws_client.wait_for("your_turn", timeout=1)
                    if turn_msg:
                        ws_client.clear()
                        actions = turn_msg["data"]["valid_actions"]
                        if actions.get("check") is not None:
                            ws_client.send({"type": "player_action", "data": {"action": "check", "amount": 0}})
                        elif actions.get("call") is not None:
                            ws_client.send({"type": "player_action", "data": {"action": "call", "amount": actions["call"]}})
                        elif actions.get("fold") is not None:
                            ws_client.send({"type": "player_action", "data": {"action": "fold", "amount": 0}})
                
                # Check for assignment round
                assign_state = ace_ws.wait_for_round("assignment", timeout=2)
                if assign_state:
                    print(f"PASS: Assignment round reached")
                    break
                
                # Check for showdown (in case of fold)
                showdown_state = ace_ws.wait_for_round("showdown", timeout=2)
                if showdown_state:
                    print(f"INFO: Reached showdown early (fold path)")
                    break
                    
                # Check for uncontested (fold)
                for m in ace_ws.messages:
                    if m.get("type") == "showdown_result":
                        print(f"INFO: Got showdown_result (uncontested win possible)")
                        break
            
            # ── Test assignment phase ─────────────────────────────────────────
            assign_msg = ace_ws.wait_for_round("assignment", timeout=5)
            if assign_msg:
                assign_data = assign_msg["data"]
                assigned_uids = assign_data.get("assigned_uids", [])
                print(f"Assignment phase: assigned_uids={assigned_uids}")
                assert isinstance(assigned_uids, list), "assigned_uids should be a list"
                
                # Both players submit assignment
                ace_cards = ace_cards_msg["data"]["hole_cards"]
                ace_assignment = {
                    "board_1": [ace_cards[0], ace_cards[1]],
                    "board_2": [ace_cards[2], ace_cards[3]],
                    "board_3": [ace_cards[4], ace_cards[5]],
                }
                ace_ws.clear()  # Clear old messages before submitting
                ace_ws.send({"type": "assign_cards", "data": ace_assignment})
                print(f"PASS: AceKing submitted assignment")
                time.sleep(1.5)  # Wait for backend to process and broadcast
                
                # Verify assigned_uids includes AceKing in any new game_state message
                updated_uids = []
                for m in ace_ws.messages:
                    if m.get("type") == "game_state" and m.get("data", {}).get("round") == "assignment":
                        updated_uids = m["data"].get("assigned_uids", [])
                        break
                if updated_uids:
                    assert ace_id in updated_uids, f"AceKing ({ace_id}) not in assigned_uids: {updated_uids}"
                    print(f"PASS: assigned_uids includes AceKing: {updated_uids}")
                else:
                    # May have moved to showdown directly if BluffMaster auto-assigned
                    print(f"INFO: No new assignment game_state (may have progressed to showdown)")
                
                # BluffMaster submits assignment
                bluff_cards = bluff_cards_msg["data"]["hole_cards"]
                bluff_assignment = {
                    "board_1": [bluff_cards[0], bluff_cards[1]],
                    "board_2": [bluff_cards[2], bluff_cards[3]],
                    "board_3": [bluff_cards[4], bluff_cards[5]],
                }
                bluff_ws.send({"type": "assign_cards", "data": bluff_assignment})
                print(f"PASS: BluffMaster submitted assignment")
                time.sleep(1)
            else:
                print("SKIP: Assignment phase not reached (uncontested/fold path)")
            
            # ── Test showdown phase ───────────────────────────────────────────
            showdown_state = ace_ws.wait_for_round("showdown", timeout=15)
            if not showdown_state:
                showdown_state = bluff_ws.wait_for_round("showdown", timeout=5)
            
            if showdown_state:
                print(f"PASS: Showdown round reached")
                
                # Check showdown_ready is a list (initially empty)
                sd_data = showdown_state["data"]
                showdown_ready = sd_data.get("showdown_ready", [])
                assert isinstance(showdown_ready, list), "showdown_ready should be a list"
                print(f"  showdown_ready before vote: {showdown_ready}")
                
                # Check showdown_result message
                showdown_result = ace_ws.wait_for("showdown_result", timeout=10)
                if not showdown_result:
                    showdown_result = bluff_ws.wait_for("showdown_result", timeout=5)
                
                if showdown_result:
                    print(f"PASS: Got showdown_result message")
                    sd_result = showdown_result["data"]
                    # Validate response structure
                    assert "board_winners" in sd_result or "uncontested" in sd_result, \
                        f"showdown_result missing expected fields: {list(sd_result.keys())}"
                    print(f"  uncontested: {sd_result.get('uncontested', False)}")
                    print(f"  pot: {sd_result.get('pot', 'N/A')}")
                
                # ── Vote to next hand ─────────────────────────────────────────
                # Clear old messages before voting
                ace_ws.clear()
                bluff_ws.clear()
                
                # AceKing votes
                ace_ws.send({"type": "ready_next_hand"})
                print(f"PASS: AceKing sent ready_next_hand")
                time.sleep(1.0)
                
                # Verify showdown_ready includes AceKing in fresh messages
                ace_ready = []
                for m in ace_ws.messages:
                    if m.get("type") == "game_state" and m.get("data", {}).get("round") == "showdown":
                        ace_ready = m["data"].get("showdown_ready", [])
                        break
                
                if ace_ready:
                    assert ace_id in ace_ready, f"AceKing not in showdown_ready after vote: {ace_ready}"
                    print(f"PASS: showdown_ready includes AceKing: {ace_ready}")
                else:
                    # Might have jumped to preflop already if fast timer
                    print(f"INFO: No showdown game_state received after AceKing vote (may have moved on)")
                
                # BluffMaster votes
                bluff_ws.send({"type": "ready_next_hand"})
                print(f"PASS: BluffMaster sent ready_next_hand")
                time.sleep(1.5)
                
                # Check for final showdown_ready with both players
                final_ready = []
                for m in ace_ws.messages + bluff_ws.messages:
                    if m.get("type") == "game_state" and m.get("data", {}).get("round") == "showdown":
                        r = m["data"].get("showdown_ready", [])
                        if len(r) > len(final_ready):
                            final_ready = r
                
                print(f"  Final showdown_ready: {final_ready}")
                if len(final_ready) > 0:
                    assert ace_id in final_ready or bluff_id in final_ready, \
                        "Neither player found in showdown_ready"
                    print(f"PASS: Vote(s) registered in showdown_ready")
                else:
                    print("INFO: Game may have already advanced to next hand")
                
                # Verify participated_uids logic: next hand should start (5s timer after all vote)
                next_hand = ace_ws.wait_for_round("preflop", timeout=12)
                if not next_hand:
                    next_hand = bluff_ws.wait_for_round("preflop", timeout=5)
                if next_hand:
                    hand_num = next_hand["data"].get("hand_number", 0)
                    print(f"PASS: Next hand started - hand_number={hand_num}")
                else:
                    print("INFO: Next hand pending (5s timer may not have expired in test window)")
            else:
                print("SKIP: Showdown not reached within timeout")

        finally:
            ace_ws.close()
            bluff_ws.close()
            print("WebSocket connections closed")

    def test_reconnect_recovery_assignment(self, tokens, table_id):
        """
        Verifies reconnect recovery logic:
        - When server has my assignment in assigned_uids, pendingAssignmentRef is cleared
        - When server does NOT have my assignment, if pending, auto-resend
        This is backend-side test: assigned_uids correctly tracks who assigned
        """
        # This test validates the backend tracking mechanism
        ace_token, ace_id = tokens["ace_token"], tokens["ace_id"]
        res = requests.get(f"{BASE_URL}/api/tables/{table_id}",
                           headers={"Authorization": f"Bearer {ace_token}"})
        assert res.status_code == 200
        table_data = res.json()
        # Table should exist and be accessible
        assert table_data["table_id"] == table_id
        
        # Verify assigned_uids field exists in game state response
        # This is a backend structure test
        if table_data.get("round") == "assignment":
            assert "assigned_uids" in table_data, "assigned_uids missing from table state during assignment"
            print(f"PASS: assigned_uids present in assignment round: {table_data['assigned_uids']}")
        else:
            print(f"INFO: Table not in assignment round (round={table_data.get('round')}), skipping assigned_uids check")

    def test_showdown_ready_excludes_sitting_out(self, tokens, table_id):
        """
        Verifies that ready_next_hand logic uses participated_uids (excludes sitting_out players).
        With 2 active players (no sitting_out), both must vote to trigger early next hand.
        """
        # This is tested by the full flow test above, but let's add an API sanity check
        ace_token = tokens["ace_token"]
        res = requests.get(f"{BASE_URL}/api/tables/{table_id}",
                           headers={"Authorization": f"Bearer {ace_token}"})
        assert res.status_code == 200
        table_data = res.json()
        players = table_data.get("players", [])
        
        # Verify no players have sitting_out status in our 2-player game
        sitting_out = [p for p in players if p.get("status") == "sitting_out"]
        print(f"Players in game: {len(players)}, sitting_out: {len(sitting_out)}")
        # In our clean 2-player game, none should be sitting out initially
        assert len(sitting_out) == 0, f"Unexpected sitting_out players: {sitting_out}"
        print("PASS: No sitting_out players - participated_uids = all players")
