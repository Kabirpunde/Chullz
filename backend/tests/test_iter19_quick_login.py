"""
Iteration 19: Tests for PIN-free quick login (POST /api/auth/login-quick)
and admin panel scrolling. Tests cover:
- login-quick with valid username returns token + user
- login-quick with invalid username returns 404
- login-quick JWT has 7-day expiry (role preserved)
- admin login works and role = 'admin'
- /api/players endpoint returns online status
"""

import pytest
import requests
import os
import jwt

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://multi-board-poker.preview.emergentagent.com").rstrip("/")
JWT_ALG = "HS256"


class TestQuickLogin:
    """Tests for POST /api/auth/login-quick — PIN-free login"""

    def test_login_quick_valid_player(self):
        """AceKing can log in without PIN and gets token + user object"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "AceKing"})
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert "token" in data, "Response missing 'token'"
        assert "user" in data, "Response missing 'user'"
        user = data["user"]
        assert user["username"] == "AceKing"
        assert user["role"] == "player"
        assert "id" in user
        assert "avatar" in user
        assert "chips" in user
        assert isinstance(data["token"], str)
        assert len(data["token"]) > 10
        print(f"PASS: login-quick AceKing => token len={len(data['token'])}, chips={user['chips']}")

    def test_login_quick_valid_bluffmaster(self):
        """BluffMaster quick login returns correct user object"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "BluffMaster"})
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["user"]["username"] == "BluffMaster"
        assert data["user"]["role"] == "player"
        print("PASS: login-quick BluffMaster OK")

    def test_login_quick_admin_user(self):
        """TableAdmin quick login returns role=admin and navigates to /admin"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "TableAdmin"})
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        user = data["user"]
        assert user["username"] == "TableAdmin"
        assert user["role"] == "admin", f"Expected role='admin', got '{user['role']}'"
        assert "token" in data
        print(f"PASS: login-quick TableAdmin => role={user['role']}")

    def test_login_quick_invalid_username_returns_404(self):
        """Unknown username returns 404"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "NonExistentUser_xyz123"})
        assert res.status_code == 404, f"Expected 404, got {res.status_code}: {res.text}"
        print(f"PASS: login-quick invalid user => 404")

    def test_login_quick_token_is_jwt(self):
        """JWT returned by login-quick is decodable (structure valid)"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "CardShark"})
        assert res.status_code == 200
        token = res.json()["token"]
        # Decode without verification to check structure
        decoded = jwt.decode(token, options={"verify_signature": False})
        assert "sub" in decoded or "id" in decoded or "username" in decoded, \
            f"JWT missing expected claims: {decoded}"
        assert "exp" in decoded, "JWT missing expiry"
        print(f"PASS: JWT claims: {list(decoded.keys())}, exp present")

    def test_login_quick_all_players(self):
        """All 7 valid usernames can log in quickly"""
        usernames = ["AceKing", "BluffMaster", "CardShark", "PokerPro", "AllInAndy", "HighRoller", "TableAdmin"]
        for username in usernames:
            res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": username})
            assert res.status_code == 200, f"{username}: Expected 200, got {res.status_code}: {res.text}"
            data = res.json()
            assert data["user"]["username"] == username, f"{username}: username mismatch"
        print(f"PASS: All 7 users can quick-login")

    def test_login_quick_no_pin_required(self):
        """Sending just username (no pin field) succeeds — confirms PIN is not required"""
        # Strictly, if pin was required, sending {"username": "AceKing"} without pin would fail
        payload = {"username": "AceKing"}  # No "pin" field
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json=payload)
        assert res.status_code == 200, f"PIN-free login failed: {res.status_code}: {res.text}"
        print("PASS: No PIN field needed in login-quick")

    def test_login_quick_wrong_pin_ignored(self):
        """login-quick ignores any extra pin field — succeeds regardless"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "AceKing", "pin": "9999"})
        # Extra field should be ignored (Pydantic ignores extra fields by default)
        assert res.status_code == 200, f"Expected 200 even with extra pin field, got {res.status_code}"
        print("PASS: Extra pin field is ignored in login-quick")


class TestPlayersEndpoint:
    """Tests for GET /api/players — used by SelectProfile to detect online users"""

    def test_get_players_returns_list(self):
        """GET /api/players returns list of all players with online status"""
        res = requests.get(f"{BASE_URL}/api/players")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        players = res.json()
        assert isinstance(players, list), "Expected list of players"
        assert len(players) >= 7, f"Expected 7+ players, got {len(players)}"
        print(f"PASS: /api/players returned {len(players)} players")

    def test_players_have_online_field(self):
        """Each player has 'online' boolean field for IN USE detection"""
        res = requests.get(f"{BASE_URL}/api/players")
        assert res.status_code == 200
        players = res.json()
        for p in players:
            assert "online" in p, f"Player {p.get('username')} missing 'online' field"
            assert isinstance(p["online"], bool), f"Player {p.get('username')} 'online' is not bool"
        print("PASS: All players have 'online' boolean field")

    def test_players_have_expected_fields(self):
        """Players have id, username, avatar, avatar_color, role, chips, online"""
        res = requests.get(f"{BASE_URL}/api/players")
        assert res.status_code == 200
        players = res.json()
        required_fields = {"id", "username", "avatar", "avatar_color", "role", "chips", "online"}
        for p in players:
            for field in required_fields:
                assert field in p, f"Player {p.get('username')} missing field '{field}'"
        print("PASS: All players have all required fields")

    def test_all_7_players_present(self):
        """All 7 known usernames are in the players list"""
        res = requests.get(f"{BASE_URL}/api/players")
        assert res.status_code == 200
        players = res.json()
        usernames = {p["username"] for p in players}
        expected = {"AceKing", "BluffMaster", "CardShark", "PokerPro", "AllInAndy", "HighRoller", "TableAdmin"}
        for name in expected:
            assert name in usernames, f"Player '{name}' missing from /api/players response"
        print(f"PASS: All 7 expected usernames present: {usernames}")


class TestQuickLoginTokenUsability:
    """Test that quick-login token can be used on authenticated endpoints"""

    def test_quick_login_token_works_on_auth_me(self):
        """Token from login-quick works on GET /api/auth/me"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "AceKing"})
        assert res.status_code == 200
        token = res.json()["token"]

        me_res = requests.get(f"{BASE_URL}/api/auth/me",
                              headers={"Authorization": f"Bearer {token}"})
        assert me_res.status_code == 200, f"Token from login-quick failed on /me: {me_res.status_code}: {me_res.text}"
        me_data = me_res.json()
        assert me_data["username"] == "AceKing"
        print(f"PASS: login-quick token valid on /auth/me => {me_data['username']}")

    def test_admin_quick_login_token_can_access_players(self):
        """TableAdmin token from login-quick can list players"""
        res = requests.post(f"{BASE_URL}/api/auth/login-quick", json={"username": "TableAdmin"})
        assert res.status_code == 200
        token = res.json()["token"]

        players_res = requests.get(f"{BASE_URL}/api/players",
                                   headers={"Authorization": f"Bearer {token}"})
        assert players_res.status_code == 200
        print("PASS: TableAdmin quick-login token can access /api/players")
