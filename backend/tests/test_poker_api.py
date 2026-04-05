"""Poker Club API Tests - auth, players, admin chip distribution"""
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")


@pytest.fixture
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def player_token(api):
    res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "1111"})
    assert res.status_code == 200
    return res.json()["token"]


@pytest.fixture
def admin_token(api):
    res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "TableAdmin", "pin": "0000"})
    assert res.status_code == 200
    return res.json()["token"]


# ── Auth Tests ────────────────────────────────────────────────────────────────

class TestAuth:
    def test_login_acek_king(self, api):
        res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "1111"})
        assert res.status_code == 200
        data = res.json()
        assert "token" in data
        assert data["user"]["username"] == "AceKing"
        assert data["user"]["role"] == "player"

    def test_login_bluff_master(self, api):
        res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "BluffMaster", "pin": "2222"})
        assert res.status_code == 200
        assert res.json()["user"]["username"] == "BluffMaster"

    def test_login_admin(self, api):
        res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "TableAdmin", "pin": "0000"})
        assert res.status_code == 200
        data = res.json()
        assert data["user"]["role"] == "admin"
        assert data["user"]["chips"] == 999999

    def test_wrong_pin(self, api):
        res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "AceKing", "pin": "9999"})
        assert res.status_code == 401

    def test_wrong_username(self, api):
        res = api.post(f"{BASE_URL}/api/auth/login", json={"username": "Nobody", "pin": "1111"})
        assert res.status_code == 401

    def test_me_endpoint(self, api, player_token):
        res = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {player_token}"})
        assert res.status_code == 200
        assert res.json()["username"] == "AceKing"

    def test_me_no_token(self, api):
        res = api.get(f"{BASE_URL}/api/auth/me")
        assert res.status_code == 401


# ── Players Tests ─────────────────────────────────────────────────────────────

class TestPlayers:
    def test_get_all_players(self, api):
        res = api.get(f"{BASE_URL}/api/players")
        assert res.status_code == 200
        data = res.json()
        assert len(data) == 7  # 6 players + 1 admin
        usernames = [p["username"] for p in data]
        for name in ["AceKing", "BluffMaster", "CardShark", "PokerPro", "AllInAndy", "HighRoller", "TableAdmin"]:
            assert name in usernames

    def test_players_have_required_fields(self, api):
        res = api.get(f"{BASE_URL}/api/players")
        assert res.status_code == 200
        for p in res.json():
            assert "id" in p
            assert "username" in p
            assert "avatar" in p
            assert "chips" in p
            assert "online" in p
            assert "_id" not in p  # MongoDB _id should be excluded

    def test_admin_in_players(self, api):
        res = api.get(f"{BASE_URL}/api/players")
        admin = next((p for p in res.json() if p["username"] == "TableAdmin"), None)
        assert admin is not None
        assert admin["role"] == "admin"


# ── Admin Distribute Chips Tests ──────────────────────────────────────────────

class TestAdminChips:
    def test_distribute_chips_success(self, api, admin_token):
        # Get current chips first
        players = api.get(f"{BASE_URL}/api/players").json()
        ace = next(p for p in players if p["username"] == "AceKing")
        before = ace["chips"]

        res = api.post(
            f"{BASE_URL}/api/admin/distribute-chips",
            json={"target_username": "AceKing", "amount": 500},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["success"] is True
        assert data["new_chips"] == before + 500

        # Restore chips
        api.post(
            f"{BASE_URL}/api/admin/distribute-chips",
            json={"target_username": "AceKing", "amount": -500},
            headers={"Authorization": f"Bearer {admin_token}"},
        )

    def test_distribute_chips_player_rejected(self, api, player_token):
        res = api.post(
            f"{BASE_URL}/api/admin/distribute-chips",
            json={"target_username": "BluffMaster", "amount": 100},
            headers={"Authorization": f"Bearer {player_token}"},
        )
        assert res.status_code == 403

    def test_distribute_chips_no_auth(self, api):
        res = api.post(
            f"{BASE_URL}/api/admin/distribute-chips",
            json={"target_username": "AceKing", "amount": 100},
        )
        assert res.status_code == 401

    def test_distribute_chips_unknown_player(self, api, admin_token):
        res = api.post(
            f"{BASE_URL}/api/admin/distribute-chips",
            json={"target_username": "NoSuchPlayer", "amount": 100},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert res.status_code == 404
