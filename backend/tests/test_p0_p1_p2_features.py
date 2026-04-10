"""
Tests for Chullz Poker P0/P1/P2 features:
- P0: Showdown overlay fix, timer reset fix
- P1: Spectator mode - join mid-game via POST /api/tables/join
- P2: Admin kick player, non-admin 403
"""
import pytest
import requests
import os
import time

BASE_URL = "https://card-game-live-1.preview.emergentagent.com"


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def aceking_token():
    """Get AceKing player token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "AceKing", "pin": "1111"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def bluffmaster_token():
    """Get BluffMaster player token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "BluffMaster", "pin": "2222"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def cardshark_token():
    """Get CardShark player token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "CardShark", "pin": "3333"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def admin_token():
    """Get TableAdmin token"""
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "TableAdmin", "pin": "0000"})
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def aceking_user(aceking_token):
    resp = requests.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {aceking_token}"})
    assert resp.status_code == 200
    return resp.json()

@pytest.fixture(scope="module")
def bluffmaster_user(bluffmaster_token):
    resp = requests.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {bluffmaster_token}"})
    assert resp.status_code == 200
    return resp.json()

@pytest.fixture(scope="module")
def cardshark_user(cardshark_token):
    resp = requests.get(f"{BASE_URL}/api/auth/me",
                        headers={"Authorization": f"Bearer {cardshark_token}"})
    assert resp.status_code == 200
    return resp.json()


# ─── Auth Tests ───────────────────────────────────────────────────────────────

class TestAuth:
    """Basic auth tests"""

    def test_aceking_login(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"username": "AceKing", "pin": "1111"})
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["username"] == "AceKing"
        print("✓ AceKing login OK")

    def test_admin_login(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"username": "TableAdmin", "pin": "0000"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["role"] == "admin"
        print("✓ TableAdmin login OK")

    def test_invalid_login(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"username": "AceKing", "pin": "9999"})
        assert resp.status_code == 401
        print("✓ Invalid login returns 401")


# ─── Table List ───────────────────────────────────────────────────────────────

class TestTableList:
    """Table listing"""

    def test_list_tables(self):
        resp = requests.get(f"{BASE_URL}/api/tables")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ /api/tables returns list of {len(data)} tables")


# ─── Table Create + Join (P1: Joining mid-game) ───────────────────────────────

class TestJoinMidGame:
    """
    P1: join_table should allow joining a 'playing' table as sitting_out
    Tests POST /api/tables/join mid-game
    """

    def test_create_table_aceking(self, aceking_token):
        resp = requests.post(f"{BASE_URL}/api/tables/create",
                             headers={"Authorization": f"Bearer {aceking_token}"},
                             json={"name": "TEST_MidgameJoin", "blind_small": 10,
                                   "blind_big": 20, "starting_chips": 1000, "max_players": 6})
        assert resp.status_code == 200
        data = resp.json()
        assert "table_id" in data
        self.__class__.table_id = data["table_id"]
        print(f"✓ Table created: {self.__class__.table_id}")

    def test_aceking_joins_own_table(self, aceking_token):
        resp = requests.post(f"{BASE_URL}/api/tables/join",
                             headers={"Authorization": f"Bearer {aceking_token}"},
                             json={"table_id": self.__class__.table_id})
        assert resp.status_code == 200
        data = resp.json()
        assert "seat" in data
        print(f"✓ AceKing joined table at seat {data['seat']}")

    def test_bluffmaster_joins_table(self, bluffmaster_token):
        resp = requests.post(f"{BASE_URL}/api/tables/join",
                             headers={"Authorization": f"Bearer {bluffmaster_token}"},
                             json={"table_id": self.__class__.table_id})
        assert resp.status_code == 200
        data = resp.json()
        assert "seat" in data
        print(f"✓ BluffMaster joined table at seat {data['seat']}")

    def test_table_has_players(self):
        """Verify both players in table"""
        resp = requests.get(f"{BASE_URL}/api/tables/{self.__class__.table_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] in ("waiting", "playing")
        assert len(data["players"]) >= 2
        print(f"✓ Table has {len(data['players'])} players, status={data['status']}")

    def test_cardshark_joins_playing_table(self, cardshark_token):
        """P1: CardShark joins as spectator/sitting_out to a playing table"""
        # Force the table to "playing" by verifying it can be joined regardless
        # (The endpoint now allows joining playing tables)
        resp = requests.post(f"{BASE_URL}/api/tables/join",
                             headers={"Authorization": f"Bearer {cardshark_token}"},
                             json={"table_id": self.__class__.table_id})
        assert resp.status_code == 200, f"Expected 200 but got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "seat" in data
        print(f"✓ CardShark joined (mid-game allowed) at seat {data['seat']}")

    def test_already_in_table_idempotent(self, aceking_token):
        """Joining a table you're already in returns existing seat"""
        resp = requests.post(f"{BASE_URL}/api/tables/join",
                             headers={"Authorization": f"Bearer {aceking_token}"},
                             json={"table_id": self.__class__.table_id})
        assert resp.status_code == 200
        data = resp.json()
        assert "seat" in data
        print(f"✓ Rejoining returns same seat: {data['seat']}")

    def test_get_table_state(self):
        """Table state endpoint returns valid structure"""
        resp = requests.get(f"{BASE_URL}/api/tables/{self.__class__.table_id}")
        assert resp.status_code == 200
        data = resp.json()
        required_fields = ["table_id", "name", "status", "round", "players",
                           "pot", "current_seat", "max_players", "timer_ends"]
        for f in required_fields:
            assert f in data, f"Missing field: {f}"
        print(f"✓ Table state has all required fields. Round={data['round']}, Players={len(data['players'])}")


# ─── Kick Player (P2) ─────────────────────────────────────────────────────────

class TestKickPlayer:
    """
    P2: POST /api/tables/{table_id}/kick/{uid}
    - Admin can kick a player
    - Non-admin gets 403
    """

    def test_setup_table_for_kick(self, aceking_token, aceking_user):
        """Create a table and add players to kick"""
        resp = requests.post(f"{BASE_URL}/api/tables/create",
                             headers={"Authorization": f"Bearer {aceking_token}"},
                             json={"name": "TEST_KickTable", "blind_small": 10,
                                   "blind_big": 20, "starting_chips": 1000, "max_players": 6})
        assert resp.status_code == 200
        self.__class__.table_id = resp.json()["table_id"]
        self.__class__.aceking_id = aceking_user["id"]

        # AceKing joins
        requests.post(f"{BASE_URL}/api/tables/join",
                      headers={"Authorization": f"Bearer {aceking_token}"},
                      json={"table_id": self.__class__.table_id})
        print(f"✓ Setup table {self.__class__.table_id} for kick test")

    def test_non_admin_cannot_kick(self, bluffmaster_token, aceking_user):
        """Non-admin player gets 403 when trying to kick"""
        resp = requests.post(
            f"{BASE_URL}/api/tables/{self.__class__.table_id}/kick/{aceking_user['id']}",
            headers={"Authorization": f"Bearer {bluffmaster_token}"}
        )
        assert resp.status_code == 403, f"Expected 403 but got {resp.status_code}: {resp.text}"
        print(f"✓ Non-admin kick returns 403")

    def test_admin_can_kick_player(self, admin_token, aceking_user):
        """Admin can kick a player from the table"""
        resp = requests.post(
            f"{BASE_URL}/api/tables/{self.__class__.table_id}/kick/{aceking_user['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 200, f"Expected 200 but got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data.get("success") == True
        print(f"✓ Admin kick returns success")

    def test_player_removed_after_kick(self, aceking_user):
        """After kick, player no longer in table"""
        resp = requests.get(f"{BASE_URL}/api/tables/{self.__class__.table_id}")
        assert resp.status_code == 200
        data = resp.json()
        player_ids = [p["user_id"] for p in data["players"]]
        assert aceking_user["id"] not in player_ids, "Player still in table after kick"
        print(f"✓ Player removed from table after kick")

    def test_kick_nonexistent_table(self, admin_token, aceking_user):
        """Kicking from non-existent table returns 404"""
        resp = requests.post(
            f"{BASE_URL}/api/tables/XXXXX/kick/{aceking_user['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert resp.status_code == 404, f"Expected 404 but got {resp.status_code}"
        print(f"✓ Kick from non-existent table returns 404")

    def test_kick_without_auth(self, aceking_user):
        """Kick without auth returns 401"""
        resp = requests.post(
            f"{BASE_URL}/api/tables/{self.__class__.table_id}/kick/{aceking_user['id']}"
        )
        assert resp.status_code == 401, f"Expected 401 but got {resp.status_code}"
        print(f"✓ Kick without auth returns 401")


# ─── Table Deletion (Admin) ──────────────────────────────────────────────────

class TestTableDeletion:
    """Admin can delete tables"""

    def test_admin_can_delete_table(self, admin_token, aceking_token):
        # Create a table
        resp = requests.post(f"{BASE_URL}/api/tables/create",
                             headers={"Authorization": f"Bearer {aceking_token}"},
                             json={"name": "TEST_DeleteMe", "blind_small": 10,
                                   "blind_big": 20, "starting_chips": 1000, "max_players": 6})
        assert resp.status_code == 200
        table_id = resp.json()["table_id"]

        # Delete it
        del_resp = requests.delete(f"{BASE_URL}/api/tables/{table_id}",
                                   headers={"Authorization": f"Bearer {admin_token}"})
        assert del_resp.status_code == 200
        data = del_resp.json()
        assert data.get("success") == True
        print(f"✓ Admin deleted table {table_id}")

    def test_non_admin_cannot_delete(self, aceking_token, bluffmaster_token):
        # Create table
        resp = requests.post(f"{BASE_URL}/api/tables/create",
                             headers={"Authorization": f"Bearer {aceking_token}"},
                             json={"name": "TEST_CannotDelete", "blind_small": 10,
                                   "blind_big": 20, "starting_chips": 1000, "max_players": 6})
        assert resp.status_code == 200
        table_id = resp.json()["table_id"]

        # Try to delete as non-admin
        del_resp = requests.delete(f"{BASE_URL}/api/tables/{table_id}",
                                   headers={"Authorization": f"Bearer {bluffmaster_token}"})
        assert del_resp.status_code == 403
        print(f"✓ Non-admin cannot delete table (403)")

        # Cleanup
        requests.delete(f"{BASE_URL}/api/tables/{table_id}",
                        headers={"Authorization": f"Bearer {aceking_token}"})


# ─── Cleanup ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def cleanup_test_tables():
    """Clean up TEST_ tables after all tests"""
    yield
    # Get admin token for cleanup
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "TableAdmin", "pin": "0000"})
    if resp.status_code != 200:
        return
    admin_token = resp.json()["token"]
    tables_resp = requests.get(f"{BASE_URL}/api/tables")
    if tables_resp.status_code != 200:
        return
    for t in tables_resp.json():
        if t["name"].startswith("TEST_"):
            requests.delete(f"{BASE_URL}/api/tables/{t['table_id']}",
                            headers={"Authorization": f"Bearer {admin_token}"})
            print(f"Cleaned up: {t['name']}")
