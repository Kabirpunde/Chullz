"""Chullz Phase 2 Game API Tests - tables, game flow, WebSocket"""
import pytest
import requests
import os
import json
import threading
import time

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def ace_token(api):
    res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "1111"})
    assert res.status_code == 200
    return res.json()["token"]


@pytest.fixture
def bluff_token(api):
    res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "BluffMaster", "pin": "2222"})
    assert res.status_code == 200
    return res.json()["token"]


@pytest.fixture
def shark_token(api):
    res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "CardShark", "pin": "3333"})
    assert res.status_code == 200
    return res.json()["token"]


# ── Tables CRUD Tests ─────────────────────────────────────────────────────────

class TestTablesList:
    """Test GET /api/tables endpoint"""

    def test_list_tables_unauthenticated(self, api):
        """Tables list is public"""
        res = api.get(f"{BASE_URL}/api/tables")
        assert res.status_code == 200
        assert isinstance(res.json(), list)

    def test_list_tables_response_fields(self, api, ace_token):
        """Create table, then verify it appears in list with proper fields"""
        # Create a table first
        create_res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_field_check", "blind_small": 25, "blind_big": 50, "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert create_res.status_code == 200
        table_id = create_res.json()["table_id"]

        try:
            tables = api.get(f"{BASE_URL}/api/tables").json()
            t = next((t for t in tables if t["table_id"] == table_id), None)
            assert t is not None
            for field in ["table_id", "name", "status", "blind_small", "blind_big",
                          "max_players", "starting_chips", "player_count", "players"]:
                assert field in t, f"Missing field: {field}"
            assert t["name"] == "TEST_field_check"
            assert t["blind_small"] == 25
            assert t["blind_big"] == 50
        finally:
            # Cleanup
            api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                       headers={"Authorization": f"Bearer {ace_token}"})


class TestCreateTable:
    """Test POST /api/tables/create"""

    def test_create_table_success(self, api, ace_token):
        """Create table and verify response"""
        res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_create_success", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert "table_id" in data
        assert data["name"] == "TEST_create_success"
        assert len(data["table_id"]) == 6  # 6-char ID
        # Cleanup
        api.delete(f"{BASE_URL}/api/tables/{data['table_id']}/leave",
                   headers={"Authorization": f"Bearer {ace_token}"})

    def test_create_table_requires_auth(self, api):
        """Cannot create table without authentication"""
        res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_no_auth", "blind_small": 25, "blind_big": 50},
        )
        assert res.status_code == 401

    def test_create_table_invalid_blinds(self, api, ace_token):
        """Big blind must be >= 2x small blind"""
        res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_bad_blinds", "blind_small": 50, "blind_big": 20},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert res.status_code == 400

    def test_create_table_preset_values(self, api, ace_token):
        """Test preset values: blinds 25/50, starting 5000, max 6"""
        res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "Chullz Test Game", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert res.status_code == 200
        table_id = res.json()["table_id"]
        # Check via GET
        detail = api.get(f"{BASE_URL}/api/tables/{table_id}").json()
        assert detail["blind_small"] == 25
        assert detail["blind_big"] == 50
        assert detail["max_players"] == 6
        # Cleanup
        api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                   headers={"Authorization": f"Bearer {ace_token}"})


class TestJoinTable:
    """Test POST /api/tables/join"""

    def test_join_table_success(self, api, ace_token, bluff_token):
        """Two players can join a table"""
        # AceKing creates table
        create_res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_join_test", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        table_id = create_res.json()["table_id"]

        # AceKing joins (host auto-joins in lobby flow, also test manual join)
        join1 = api.post(
            f"{BASE_URL}/api/tables/join",
            json={"table_id": table_id},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert join1.status_code == 200
        assert "seat" in join1.json()

        # BluffMaster joins
        join2 = api.post(
            f"{BASE_URL}/api/tables/join",
            json={"table_id": table_id},
            headers={"Authorization": f"Bearer {bluff_token}"},
        )
        assert join2.status_code == 200

        # Check 2 players in table
        detail = api.get(f"{BASE_URL}/api/tables/{table_id}").json()
        assert len(detail["players"]) == 2

        # Cleanup
        api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                   headers={"Authorization": f"Bearer {ace_token}"})
        api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                   headers={"Authorization": f"Bearer {bluff_token}"})

    def test_join_nonexistent_table(self, api, ace_token):
        """Joining nonexistent table returns 404"""
        res = api.post(
            f"{BASE_URL}/api/tables/join",
            json={"table_id": "XXXXXX"},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        assert res.status_code == 404

    def test_join_requires_auth(self, api):
        """Joining requires authentication"""
        res = api.post(
            f"{BASE_URL}/api/tables/join",
            json={"table_id": "XXXXXX"},
        )
        assert res.status_code == 401

    def test_join_already_joined_is_idempotent(self, api, ace_token):
        """Joining twice returns same seat without error"""
        create_res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_idempotent", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        table_id = create_res.json()["table_id"]

        # Join twice
        join1 = api.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id},
                         headers={"Authorization": f"Bearer {ace_token}"})
        join2 = api.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id},
                         headers={"Authorization": f"Bearer {ace_token}"})
        assert join1.status_code == 200
        assert join2.status_code == 200
        assert join1.json()["seat"] == join2.json()["seat"]  # Same seat

        # Cleanup
        api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                   headers={"Authorization": f"Bearer {ace_token}"})


class TestGetTable:
    """Test GET /api/tables/{table_id}"""

    def test_get_table_state(self, api, ace_token):
        """Get table returns correct initial state"""
        create_res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_get_state", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        table_id = create_res.json()["table_id"]
        api.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id},
                 headers={"Authorization": f"Bearer {ace_token}"})

        detail = api.get(f"{BASE_URL}/api/tables/{table_id}").json()
        assert detail["table_id"] == table_id
        assert detail["status"] == "waiting"
        assert detail["round"] == "waiting"
        assert detail["blind_small"] == 25
        assert detail["blind_big"] == 50
        assert detail["max_players"] == 6

        # Cleanup
        api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                   headers={"Authorization": f"Bearer {ace_token}"})

    def test_get_nonexistent_table(self, api):
        """404 for nonexistent table"""
        res = api.get(f"{BASE_URL}/api/tables/XXXXXX")
        assert res.status_code == 404


class TestLeaveTable:
    """Test DELETE /api/tables/{table_id}/leave"""

    def test_leave_table_success(self, api, ace_token):
        """Player can leave table"""
        create_res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_leave", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        table_id = create_res.json()["table_id"]
        api.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id},
                 headers={"Authorization": f"Bearer {ace_token}"})

        leave_res = api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                               headers={"Authorization": f"Bearer {ace_token}"})
        assert leave_res.status_code == 200
        assert leave_res.json()["success"] is True

        # Table should be gone after last player leaves
        get_res = api.get(f"{BASE_URL}/api/tables/{table_id}")
        assert get_res.status_code == 404

    def test_leave_with_two_players(self, api, ace_token, bluff_token):
        """Table persists when 2nd player leaves but 1st remains"""
        create_res = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_leave_2p", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {ace_token}"},
        )
        table_id = create_res.json()["table_id"]
        api.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id},
                 headers={"Authorization": f"Bearer {ace_token}"})
        api.post(f"{BASE_URL}/api/tables/join", json={"table_id": table_id},
                 headers={"Authorization": f"Bearer {bluff_token}"})

        # BluffMaster leaves
        api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                   headers={"Authorization": f"Bearer {bluff_token}"})

        # Table still exists with 1 player
        detail = api.get(f"{BASE_URL}/api/tables/{table_id}").json()
        assert len(detail["players"]) == 1

        # Cleanup
        api.delete(f"{BASE_URL}/api/tables/{table_id}/leave",
                   headers={"Authorization": f"Bearer {ace_token}"})


class TestGameEngine:
    """Test the Chullz game engine via backend.game_engine module"""

    def test_game_engine_deck_generation(self):
        """Verify deck has 52 unique cards"""
        import sys
        sys.path.insert(0, '/app/backend')
        from game_engine import new_deck
        deck = new_deck()
        assert len(deck) == 52
        assert len(set(deck)) == 52

    def test_game_engine_deal(self):
        """Verify deal returns correct number of cards"""
        import sys
        sys.path.insert(0, '/app/backend')
        from game_engine import new_deck, deal
        deck = new_deck()
        dealt, remaining = deal(deck, 6)
        assert len(dealt) == 6
        assert len(remaining) == 46

    def test_game_engine_valid_actions(self):
        """Test valid actions with no current bet (check available)"""
        import sys
        sys.path.insert(0, '/app/backend')
        from game_engine import valid_actions
        acts = valid_actions(
            player_chips=5000, player_bet=0, current_bet=0,
            last_raise_size=50, blind_big=50, total_pot=100
        )
        assert "fold" in acts
        assert "check" in acts
        assert "raise" in acts

    def test_game_engine_valid_actions_with_bet(self):
        """Test valid actions when there's a bet to call"""
        import sys
        sys.path.insert(0, '/app/backend')
        from game_engine import valid_actions
        acts = valid_actions(
            player_chips=5000, player_bet=0, current_bet=100,
            last_raise_size=100, blind_big=50, total_pot=200
        )
        assert "fold" in acts
        assert "call" in acts
        assert "check" not in acts

    def test_game_engine_best_hand(self):
        """Test best hand evaluator"""
        import sys
        sys.path.insert(0, '/app/backend')
        from game_engine import best_hand
        # Royal flush
        score, desc, best5 = best_hand(['Ah', 'Kh', 'Qh', 'Jh', 'Th'])
        assert "Royal Flush" in desc or "Straight Flush" in desc

        # High card
        score2, desc2, _ = best_hand(['2h', '5d', '7c', '9s', 'Jh'])
        assert "High Card" in desc2

    def test_game_engine_score_boards(self):
        """Test board scoring with 2 players"""
        import sys
        sys.path.insert(0, '/app/backend')
        from game_engine import score_boards
        community_cards = [
            ['Ah', 'Kh', 'Qh', '2c', '3d'],  # Board 1
            ['5c', '6c', '7c', '8c', '9c'],  # Board 2
            ['Js', 'Qs', 'Ks', 'As', '2h'],  # Board 3
        ]
        assignments = {
            "player1": {"board_1": ["Jh", "Th"], "board_2": ["Tc", "Jc"], "board_3": ["Ts", "Ks"]},
            "player2": {"board_1": ["2d", "3h"], "board_2": ["3s", "4s"], "board_3": ["3c", "4c"]},
        }
        result = score_boards(community_cards, assignments, pot=1000,
                              total_contributions={"player1": 500, "player2": 500})
        assert "player_results" in result
        assert "board_winners" in result
        assert "points" in result
        assert "chips_won" in result
        assert result["pot"] == 1000

    def test_game_engine_auto_assign(self):
        """Test auto assign fills all 3 boards with 2 cards each"""
        import sys
        sys.path.insert(0, '/app/backend')
        from game_engine import auto_assign
        hole = ['Ah', 'Kh', 'Qh', 'Jh', 'Th', '9h']
        result = auto_assign(hole, {})
        assert len(result["board_1"]) == 2
        assert len(result["board_2"]) == 2
        assert len(result["board_3"]) == 2
        all_assigned = result["board_1"] + result["board_2"] + result["board_3"]
        assert sorted(all_assigned) == sorted(hole)
