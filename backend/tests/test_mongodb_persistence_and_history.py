"""
Tests for MongoDB persistence (game_tables collection) and Stats & History APIs.
Features tested:
- GET /api/stats and /api/history empty-state responses
- POST /api/tables/create persists to MongoDB game_tables
- DELETE /api/tables/{id} removes from MongoDB
- DELETE /api/tables/{id}/leave removes player and updates MongoDB
- /api/history and /api/stats return correct data after mock hand insertion
"""
import pytest
import requests
import os
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from datetime import datetime, timezone
# pytest_asyncio not used - all async calls wrapped with run_async()

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def api():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="module")
def player_token(api):
    resp = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "1111"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]


@pytest.fixture(scope="module")
def player2_token(api):
    resp = api.post(f"{BASE_URL}/api/auth/login", json={"username": "BluffMaster", "pin": "2222"})
    assert resp.status_code == 200
    return resp.json()["token"]


@pytest.fixture(scope="module")
def admin_token(api):
    resp = api.post(f"{BASE_URL}/api/auth/login", json={"username": "TableAdmin", "pin": "0000"})
    assert resp.status_code == 200
    return resp.json()["token"]


@pytest.fixture(scope="module")
def player_info(api, player_token):
    resp = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {player_token}"})
    assert resp.status_code == 200
    return resp.json()


@pytest.fixture(scope="module")
def player2_info(api, player2_token):
    resp = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {player2_token}"})
    assert resp.status_code == 200
    return resp.json()


# Mongo client helper using asyncio
def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def _get_table_from_db(table_id: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = await db.game_tables.find_one({"_id": table_id})
    client.close()
    return doc


async def _get_hand_history_from_db(table_id: str):
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    hands = await db.hand_history.find({"table_id": table_id}).to_list(100)
    client.close()
    return hands


async def _insert_mock_hand(table_id: str, table_name: str, uid1: str, user1: str, uid2: str, user2: str):
    """Insert a mock completed hand for testing history/stats."""
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    doc = {
        "table_id": table_id,
        "table_name": table_name,
        "hand_number": 1,
        "pot": 500,
        "uncontested": False,
        "winner_username": user1,
        "board_winners": {
            "board_1": [uid1],
            "board_2": [uid1],
            "board_3": [uid2],
        },
        "points": {uid1: 2, uid2: 1},
        "chips_won": {uid1: 400, uid2: 100},
        "boards": [
            {"board_id": 1, "flop": ["Ah", "Kd", "Qc"], "turn": "Js", "river": "Tc"},
            {"board_id": 2, "flop": ["2h", "3d", "4c"], "turn": "5s", "river": "6c"},
            {"board_id": 3, "flop": ["7h", "8d", "9c"], "turn": "Ts", "river": "Jc"},
        ],
        "players": [
            {
                "user_id": uid1, "username": user1,
                "avatar": "🦁", "avatar_color": "#c9a227",
                "chips_won": 400, "contributed": 250, "net": 150,
            },
            {
                "user_id": uid2, "username": user2,
                "avatar": "🐺", "avatar_color": "#3b82f6",
                "chips_won": 100, "contributed": 250, "net": -150,
            },
        ],
        "played_at": datetime.now(timezone.utc),
    }
    result = await db.hand_history.insert_one(doc)
    inserted_id = str(result.inserted_id)
    client.close()
    return inserted_id


async def _delete_mock_hand(inserted_id: str):
    from bson import ObjectId
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    await db.hand_history.delete_one({"_id": ObjectId(inserted_id)})
    client.close()


# ─── Tests: Empty State ───────────────────────────────────────────────────────

class TestEmptyState:
    """Verify /api/stats and /api/history return [] when no hands played."""

    def test_stats_returns_list(self, api):
        resp = api.get(f"{BASE_URL}/api/stats")
        assert resp.status_code == 200, f"GET /api/stats failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "Stats should return a list"
        print(f"PASS: GET /api/stats returns list (len={len(data)})")

    def test_history_returns_list(self, api):
        resp = api.get(f"{BASE_URL}/api/history")
        assert resp.status_code == 200, f"GET /api/history failed: {resp.text}"
        data = resp.json()
        assert isinstance(data, list), "History should return a list"
        print(f"PASS: GET /api/history returns list (len={len(data)})")

    def test_history_with_limit_param(self, api):
        resp = api.get(f"{BASE_URL}/api/history?limit=50")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET /api/history?limit=50 returns list (len={len(data)})")


# ─── Tests: Table MongoDB Persistence ────────────────────────────────────────

class TestTableMongoPersistence:
    """Verify tables are saved/deleted from MongoDB game_tables collection."""

    created_table_id = None

    def test_create_table_saves_to_mongodb(self, api, player_token):
        """Creating a table should persist it to MongoDB."""
        resp = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_MongoTable_13", "blind_small": 25, "blind_big": 50,
                  "starting_chips": 5000, "max_players": 6},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200, f"Create table failed: {resp.text}"
        data = resp.json()
        assert "table_id" in data
        assert data["name"] == "TEST_MongoTable_13"
        TestTableMongoPersistence.created_table_id = data["table_id"]

        # Verify in MongoDB directly
        doc = run_async(_get_table_from_db(data["table_id"]))
        assert doc is not None, "Table not found in MongoDB after create!"
        assert doc["name"] == "TEST_MongoTable_13"
        assert doc["blind_small"] == 25
        assert doc["blind_big"] == 50
        assert doc["starting_chips"] == 5000
        print(f"PASS: Table {data['table_id']} saved to MongoDB")

    def test_join_table_updates_mongodb(self, api, player_token, player2_token, player_info, player2_info):
        """Joining a table should update the players list in MongoDB."""
        table_id = TestTableMongoPersistence.created_table_id
        assert table_id, "No table created in previous test"

        # Player 1 (creator) joins first so there are 2 players when we test leave
        resp1 = api.post(
            f"{BASE_URL}/api/tables/join",
            json={"table_id": table_id},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp1.status_code == 200, f"Player1 join failed: {resp1.text}"

        # Player 2 joins
        resp2 = api.post(
            f"{BASE_URL}/api/tables/join",
            json={"table_id": table_id},
            headers={"Authorization": f"Bearer {player2_token}"},
        )
        assert resp2.status_code == 200, f"Join table failed: {resp2.text}"

        # Verify in MongoDB
        doc = run_async(_get_table_from_db(table_id))
        assert doc is not None, "Table not found in MongoDB after join"
        player_ids = [p["user_id"] for p in doc["players"]]
        assert player2_info["id"] in player_ids, f"Player2 not in MongoDB players list: {player_ids}"
        assert player_info["id"] in player_ids, f"Player1 not in MongoDB players list: {player_ids}"
        print(f"PASS: Both players added to MongoDB players list after join")

    def test_leave_table_updates_mongodb(self, api, player2_token, player2_info):
        """Leaving a table should remove the player from MongoDB (but keep table since player1 is still there)."""
        table_id = TestTableMongoPersistence.created_table_id
        assert table_id

        resp = api.delete(
            f"{BASE_URL}/api/tables/{table_id}/leave",
            headers={"Authorization": f"Bearer {player2_token}"},
        )
        assert resp.status_code == 200, f"Leave table failed: {resp.text}"

        # Verify in MongoDB - table still exists (player1 is still there), but player2 removed
        doc = run_async(_get_table_from_db(table_id))
        assert doc is not None, "Table was deleted from MongoDB after leave (player1 should still be there)"
        player_ids = [p["user_id"] for p in doc.get("players", [])]
        assert player2_info["id"] not in player_ids, "Player2 still in MongoDB players list after leave"
        print(f"PASS: Player2 removed from MongoDB players list after leave, table still exists")

    def test_delete_table_removes_from_mongodb(self, api, admin_token):
        """Deleting a table should remove it from MongoDB."""
        table_id = TestTableMongoPersistence.created_table_id
        assert table_id

        resp = api.delete(
            f"{BASE_URL}/api/tables/{table_id}",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200, f"Delete table failed: {resp.text}"

        # Verify removed from MongoDB
        doc = run_async(_get_table_from_db(table_id))
        assert doc is None, f"Table still in MongoDB after delete: {doc}"
        print(f"PASS: Table {table_id} removed from MongoDB after delete")

    def test_create_second_table_to_verify_persistence(self, api, player_token):
        """Create table and verify it appears in /api/tables (in-memory also synced)."""
        resp = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_PersistCheck_13", "blind_small": 10, "blind_big": 20,
                  "starting_chips": 3000, "max_players": 4},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert resp.status_code == 200
        table_id = resp.json()["table_id"]

        # Check via GET /api/tables
        tables_resp = api.get(f"{BASE_URL}/api/tables")
        assert tables_resp.status_code == 200
        tables = tables_resp.json()
        ids = [t["table_id"] for t in tables]
        assert table_id in ids, f"Table {table_id} not in /api/tables"

        # Check MongoDB
        doc = run_async(_get_table_from_db(table_id))
        assert doc is not None, "Second table not in MongoDB"
        assert doc["max_players"] == 4
        print(f"PASS: Second table {table_id} verified in both API and MongoDB")

        # Cleanup
        api.delete(
            f"{BASE_URL}/api/tables/{table_id}",
            headers={"Authorization": f"Bearer {pytest._admin_token if hasattr(pytest, '_admin_token') else ''}"},
        )
        # Get admin token for cleanup
        admin_resp = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "TableAdmin", "pin": "0000"},
        )
        if admin_resp.status_code == 200:
            admin_tok = admin_resp.json()["token"]
            api.delete(
                f"{BASE_URL}/api/tables/{table_id}",
                headers={"Authorization": f"Bearer {admin_tok}"},
            )


# ─── Tests: Hand History & Stats ──────────────────────────────────────────────

class TestHandHistoryAndStats:
    """Verify /api/history and /api/stats work correctly with mock hand data."""

    mock_hand_id = None
    mock_table_id = "MOCK_TABLE_13"

    def setup_class(cls):
        """Insert mock hand history for testing."""
        # We need player IDs — fetch them
        api_session = requests.Session()
        api_session.headers.update({"Content-Type": "application/json"})

        resp1 = api_session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "AceKing", "pin": "1111"},
        )
        resp2 = api_session.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "BluffMaster", "pin": "2222"},
        )

        if resp1.status_code != 200 or resp2.status_code != 200:
            pytest.skip("Could not authenticate players for mock hand insertion")

        tok1 = resp1.json()["token"]
        tok2 = resp2.json()["token"]

        me1 = api_session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok1}"}).json()
        me2 = api_session.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok2}"}).json()

        cls.uid1 = me1["id"]
        cls.uid2 = me2["id"]
        cls.user1 = me1["username"]
        cls.user2 = me2["username"]

        # Insert mock hand
        cls.mock_hand_id = run_async(
            _insert_mock_hand(
                cls.mock_table_id, "TEST_MockTable_13",
                cls.uid1, cls.user1, cls.uid2, cls.user2
            )
        )
        print(f"Mock hand inserted with id={cls.mock_hand_id}")

    def teardown_class(cls):
        """Remove mock hand data after tests."""
        if cls.mock_hand_id:
            run_async(_delete_mock_hand(cls.mock_hand_id))
            print(f"Mock hand {cls.mock_hand_id} deleted")

    def test_history_returns_mock_hand(self, api):
        """GET /api/history should include the mock hand."""
        resp = api.get(f"{BASE_URL}/api/history?limit=50")
        assert resp.status_code == 200
        hands = resp.json()
        assert isinstance(hands, list)
        # Find our mock hand
        mock_hand = next((h for h in hands if h.get("table_id") == self.mock_table_id), None)
        assert mock_hand is not None, f"Mock hand not found in history. Found: {[h.get('table_id') for h in hands]}"
        print(f"PASS: Mock hand found in history")

    def test_history_hand_has_correct_fields(self, api):
        """History records should have all required fields."""
        resp = api.get(f"{BASE_URL}/api/history?limit=50")
        hands = resp.json()
        mock_hand = next((h for h in hands if h.get("table_id") == self.mock_table_id), None)
        assert mock_hand is not None

        assert "table_name" in mock_hand, "Missing table_name"
        assert "pot" in mock_hand, "Missing pot"
        assert "board_winners" in mock_hand, "Missing board_winners"
        assert "players" in mock_hand, "Missing players"
        assert "played_at" in mock_hand, "Missing played_at"
        assert "hand_number" in mock_hand, "Missing hand_number"

        assert mock_hand["table_name"] == "TEST_MockTable_13"
        assert mock_hand["pot"] == 500

        # Check players P&L
        players = mock_hand["players"]
        assert len(players) == 2
        player1 = next((p for p in players if p["user_id"] == self.uid1), None)
        player2 = next((p for p in players if p["user_id"] == self.uid2), None)
        assert player1 is not None, "Player1 not in hand players"
        assert player2 is not None, "Player2 not in hand players"
        assert player1["net"] == 150, f"Player1 net should be 150, got {player1.get('net')}"
        assert player2["net"] == -150, f"Player2 net should be -150, got {player2.get('net')}"
        print(f"PASS: History hand has correct fields and P&L")

    def test_history_filter_by_table_id(self, api):
        """GET /api/history?table_id=... should filter by table."""
        resp = api.get(f"{BASE_URL}/api/history?table_id={self.mock_table_id}")
        assert resp.status_code == 200
        hands = resp.json()
        assert isinstance(hands, list)
        # All returned hands should be for our mock table
        for h in hands:
            assert h.get("table_id") == self.mock_table_id, f"Wrong table_id in filtered result"
        assert len(hands) >= 1, "No hands returned for known table_id"
        print(f"PASS: History filtered by table_id returns correct results")

    def test_stats_returns_player_data(self, api):
        """GET /api/stats should aggregate hand data into player stats."""
        resp = api.get(f"{BASE_URL}/api/stats")
        assert resp.status_code == 200
        stats = resp.json()
        assert isinstance(stats, list)

        # Find our test players
        stat1 = next((s for s in stats if s.get("user_id") == self.uid1), None)
        stat2 = next((s for s in stats if s.get("user_id") == self.uid2), None)

        assert stat1 is not None, f"Player1 ({self.user1}) not in stats"
        assert stat2 is not None, f"Player2 ({self.user2}) not in stats"
        print(f"PASS: Both players found in stats")

    def test_stats_correct_fields(self, api):
        """Stats records should have all required fields."""
        resp = api.get(f"{BASE_URL}/api/stats")
        stats = resp.json()
        stat1 = next((s for s in stats if s.get("user_id") == self.uid1), None)
        assert stat1 is not None

        assert "hands_played" in stat1, "Missing hands_played"
        assert "boards_won" in stat1, "Missing boards_won"
        assert "chips_net" in stat1, "Missing chips_net"
        assert "pots_won" in stat1, "Missing pots_won"
        assert "username" in stat1, "Missing username"
        assert "avatar" in stat1, "Missing avatar"
        print(f"PASS: Stat record has all required fields")

    def test_stats_correct_chips_net(self, api):
        """Stats chips_net should reflect the net from hand history."""
        resp = api.get(f"{BASE_URL}/api/stats")
        stats = resp.json()
        stat1 = next((s for s in stats if s.get("user_id") == self.uid1), None)
        stat2 = next((s for s in stats if s.get("user_id") == self.uid2), None)

        assert stat1 is not None and stat2 is not None

        # Player1 won 150 net, player2 lost 150 net (from our mock hand)
        # Note: stats are cumulative so these are AT LEAST from our mock hand
        # We check they include our mock hand's values
        # Player1's net contribution: +150
        # Player2's net contribution: -150
        assert stat1["chips_net"] >= 150 or stat1["chips_net"] == 150, \
            f"Player1 chips_net should include +150 from mock hand, got {stat1['chips_net']}"
        assert stat2["chips_net"] <= -150, \
            f"Player2 chips_net should include -150 from mock hand, got {stat2['chips_net']}"
        print(f"PASS: chips_net values correct - p1:{stat1['chips_net']}, p2:{stat2['chips_net']}")

    def test_stats_boards_won(self, api):
        """Stats boards_won should count boards won per player."""
        resp = api.get(f"{BASE_URL}/api/stats")
        stats = resp.json()
        stat1 = next((s for s in stats if s.get("user_id") == self.uid1), None)
        stat2 = next((s for s in stats if s.get("user_id") == self.uid2), None)

        # In our mock: uid1 won board_1 and board_2 (2 boards), uid2 won board_3 (1 board)
        assert stat1["boards_won"] >= 2, f"Player1 should have won ≥2 boards, got {stat1['boards_won']}"
        assert stat2["boards_won"] >= 1, f"Player2 should have won ≥1 board, got {stat2['boards_won']}"
        print(f"PASS: boards_won correct - p1:{stat1['boards_won']}, p2:{stat2['boards_won']}")

    def test_stats_sorted_by_chips_net_descending(self, api):
        """Stats should be sorted by chips_net descending."""
        resp = api.get(f"{BASE_URL}/api/stats")
        stats = resp.json()
        if len(stats) >= 2:
            for i in range(len(stats) - 1):
                assert stats[i]["chips_net"] >= stats[i + 1]["chips_net"], \
                    f"Stats not sorted desc: {stats[i]['chips_net']} < {stats[i+1]['chips_net']}"
        print(f"PASS: Stats sorted by chips_net descending")

    def test_stats_pots_won(self, api):
        """Stats pots_won should count pots won (most points in a hand)."""
        resp = api.get(f"{BASE_URL}/api/stats")
        stats = resp.json()
        stat1 = next((s for s in stats if s.get("user_id") == self.uid1), None)

        # uid1 has 2 points (most), so they won this pot
        assert stat1["pots_won"] >= 1, f"Player1 should have won ≥1 pot, got {stat1['pots_won']}"
        print(f"PASS: pots_won correct - p1:{stat1['pots_won']}")


# ─── Tests: Auth edge cases ───────────────────────────────────────────────────

class TestAuthEndpoints:
    """Verify auth endpoints still work."""

    def test_login_success(self, api):
        resp = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "1111"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["username"] == "AceKing"
        print("PASS: Login returns token and user data")

    def test_login_wrong_pin(self, api):
        resp = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "9999"})
        assert resp.status_code == 401
        print("PASS: Wrong PIN returns 401")

    def test_tables_create_requires_auth(self, api):
        resp = api.post(f"{BASE_URL}/api/tables/create",
                        json={"name": "UnAuthTable", "blind_small": 10, "blind_big": 20,
                              "starting_chips": 1000, "max_players": 2})
        assert resp.status_code == 401
        print("PASS: Create table without auth returns 401")

    def test_delete_table_requires_admin(self, api, player_token):
        """Non-admin cannot delete table."""
        # Create a table first
        cr = api.post(
            f"{BASE_URL}/api/tables/create",
            json={"name": "TEST_AdminCheck_13", "blind_small": 10, "blind_big": 20,
                  "starting_chips": 1000, "max_players": 2},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert cr.status_code == 200
        table_id = cr.json()["table_id"]

        # Try to delete as non-admin
        dr = api.delete(
            f"{BASE_URL}/api/tables/{table_id}",
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert dr.status_code == 403, f"Expected 403, got {dr.status_code}"
        print("PASS: Non-admin cannot delete table (403)")

        # Cleanup with admin
        admin_resp = api.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": "TableAdmin", "pin": "0000"},
        )
        if admin_resp.status_code == 200:
            admin_tok = admin_resp.json()["token"]
            api.delete(
                f"{BASE_URL}/api/tables/{table_id}",
                headers={"Authorization": f"Bearer {admin_tok}"},
            )
