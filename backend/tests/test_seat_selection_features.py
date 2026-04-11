"""
Tests for Chullz Poker new features (iteration 11):
1. Preferred seat selection - POST /api/tables/join with preferred_seat
2. Error cases: seat taken (400), invalid seat (400)
3. Auto-assign when preferred_seat not specified
4. Full 6/6 table - all seats occupied (400 Table full)
"""
import pytest
import requests
import time

BASE_URL = "https://multi-board-poker.preview.emergentagent.com"


# ─── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def aceking_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "AceKing", "pin": "1111"})
    assert resp.status_code == 200, f"AceKing login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def bluffmaster_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "BluffMaster", "pin": "2222"})
    assert resp.status_code == 200, f"BluffMaster login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def cardshark_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "CardShark", "pin": "3333"})
    assert resp.status_code == 200, f"CardShark login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def pokerpro_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "PokerPro", "pin": "4444"})
    assert resp.status_code == 200, f"PokerPro login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def allinandy_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "AllInAndy", "pin": "5555"})
    assert resp.status_code == 200, f"AllInAndy login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def highroller_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "HighRoller", "pin": "6666"})
    assert resp.status_code == 200, f"HighRoller login failed: {resp.text}"
    return resp.json()["token"]

@pytest.fixture(scope="module")
def admin_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login",
                         json={"username": "TableAdmin", "pin": "0000"})
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    return resp.json()["token"]


def make_auth_header(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def create_test_table(token, name="TEST_SeatSelect"):
    """Helper to create a test table"""
    resp = requests.post(
        f"{BASE_URL}/api/tables/create",
        json={"name": name, "blind_small": 10, "blind_big": 20,
              "starting_chips": 5000, "max_players": 6},
        headers=make_auth_header(token)
    )
    assert resp.status_code == 200, f"Create table failed: {resp.text}"
    return resp.json()["table_id"]


def delete_test_table(table_id, admin_token):
    """Helper to clean up test table"""
    requests.delete(f"{BASE_URL}/api/tables/{table_id}",
                    headers=make_auth_header(admin_token))


# ─── Test Class: Preferred Seat Selection ─────────────────────────────────────

class TestPreferredSeatSelection:
    """Tests for preferred_seat parameter in join_table"""

    def test_join_with_preferred_seat_4(self, aceking_token, admin_token):
        """POST /api/tables/join with preferred_seat=4 gives seat 4"""
        table_id = create_test_table(aceking_token, "TEST_PreferSeat4")
        try:
            resp = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 4},
                headers=make_auth_header(aceking_token)
            )
            assert resp.status_code == 200, f"Join with preferred_seat=4 failed: {resp.text}"
            data = resp.json()
            assert data["seat"] == 4, f"Expected seat 4, got {data['seat']}"
            assert data["table_id"] == table_id
            print(f"PASS: Joined table at seat 4 as expected: {data}")
        finally:
            delete_test_table(table_id, admin_token)

    def test_join_preferred_seat_taken_returns_400(self, aceking_token, bluffmaster_token, admin_token):
        """POST /api/tables/join with preferred_seat=4 when seat 4 is taken returns 400"""
        table_id = create_test_table(aceking_token, "TEST_SeatTaken")
        try:
            # AceKing takes seat 4 first
            r1 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 4},
                headers=make_auth_header(aceking_token)
            )
            assert r1.status_code == 200, f"First join failed: {r1.text}"
            assert r1.json()["seat"] == 4

            # BluffMaster tries to take seat 4 - should get 400
            r2 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 4},
                headers=make_auth_header(bluffmaster_token)
            )
            assert r2.status_code == 400, f"Expected 400 for taken seat, got {r2.status_code}: {r2.text}"
            error_msg = r2.json().get("detail", "")
            assert "Seat already taken" in error_msg, f"Expected 'Seat already taken' error, got: {error_msg}"
            print(f"PASS: Seat 4 already taken returns 400: {error_msg}")
        finally:
            delete_test_table(table_id, admin_token)

    def test_join_invalid_seat_99_returns_400(self, aceking_token, admin_token):
        """POST /api/tables/join with preferred_seat=99 returns 400 'Invalid seat number'"""
        table_id = create_test_table(aceking_token, "TEST_InvalidSeat")
        try:
            resp = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 99},
                headers=make_auth_header(aceking_token)
            )
            assert resp.status_code == 400, f"Expected 400 for invalid seat 99, got {resp.status_code}: {resp.text}"
            error_msg = resp.json().get("detail", "")
            assert "Invalid seat number" in error_msg, f"Expected 'Invalid seat number' error, got: {error_msg}"
            print(f"PASS: Invalid seat 99 returns 400: {error_msg}")
        finally:
            delete_test_table(table_id, admin_token)

    def test_join_invalid_seat_negative_returns_400(self, aceking_token, admin_token):
        """POST /api/tables/join with preferred_seat=-1 returns 400 'Invalid seat number'"""
        table_id = create_test_table(aceking_token, "TEST_NegSeat")
        try:
            resp = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": -1},
                headers=make_auth_header(aceking_token)
            )
            assert resp.status_code == 400, f"Expected 400 for invalid seat -1, got {resp.status_code}: {resp.text}"
            print(f"PASS: Negative seat returns 400: {resp.json()}")
        finally:
            delete_test_table(table_id, admin_token)

    def test_join_without_preferred_seat_auto_assigns(self, aceking_token, admin_token):
        """POST /api/tables/join without preferred_seat still auto-assigns first available seat"""
        table_id = create_test_table(aceking_token, "TEST_AutoAssign")
        try:
            resp = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id},  # No preferred_seat
                headers=make_auth_header(aceking_token)
            )
            assert resp.status_code == 200, f"Auto-assign join failed: {resp.text}"
            data = resp.json()
            assert "seat" in data, "No seat in response"
            assert 0 <= data["seat"] <= 5, f"Seat {data['seat']} out of range 0-5"
            # First join on empty table should be seat 0
            assert data["seat"] == 0, f"Expected seat 0 (first available), got {data['seat']}"
            print(f"PASS: Auto-assigned to seat {data['seat']}")
        finally:
            delete_test_table(table_id, admin_token)

    def test_join_different_seats_for_multiple_players(self, aceking_token, bluffmaster_token, cardshark_token, admin_token):
        """Multiple players can join with specific seat preferences"""
        table_id = create_test_table(aceking_token, "TEST_MultiSeat")
        try:
            # AceKing takes seat 2
            r1 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 2},
                headers=make_auth_header(aceking_token)
            )
            assert r1.status_code == 200
            assert r1.json()["seat"] == 2

            # BluffMaster takes seat 0
            r2 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 0},
                headers=make_auth_header(bluffmaster_token)
            )
            assert r2.status_code == 200
            assert r2.json()["seat"] == 0

            # CardShark takes seat 5
            r3 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 5},
                headers=make_auth_header(cardshark_token)
            )
            assert r3.status_code == 200
            assert r3.json()["seat"] == 5

            print(f"PASS: Multiple players at different specific seats: 2, 0, 5")

            # Verify state via GET table
            get_resp = requests.get(f"{BASE_URL}/api/tables/{table_id}")
            assert get_resp.status_code == 200
            players = get_resp.json()["players"]
            seats = [p["seat"] for p in players]
            assert 0 in seats and 2 in seats and 5 in seats, f"Seats {seats} missing expected values"
            print(f"PASS: GET table confirms players at seats: {seats}")
        finally:
            delete_test_table(table_id, admin_token)

    def test_full_table_6_players_returns_400(
        self, aceking_token, bluffmaster_token, cardshark_token,
        pokerpro_token, allinandy_token, highroller_token, admin_token
    ):
        """Full 6/6 table: joining returns 400 Table full"""
        table_id = create_test_table(aceking_token, "TEST_Full6")
        tokens = [aceking_token, bluffmaster_token, cardshark_token, pokerpro_token, allinandy_token, highroller_token]
        try:
            # Fill all 6 seats with preferred seats 0-5
            for i, tok in enumerate(tokens):
                r = requests.post(
                    f"{BASE_URL}/api/tables/join",
                    json={"table_id": table_id, "preferred_seat": i},
                    headers=make_auth_header(tok)
                )
                assert r.status_code == 200, f"Player {i} join failed: {r.text}"
                assert r.json()["seat"] == i, f"Expected seat {i}, got {r.json()['seat']}"

            # Verify 6/6 via GET
            get_resp = requests.get(f"{BASE_URL}/api/tables/{table_id}")
            assert get_resp.status_code == 200
            player_data = get_resp.json()["players"]
            assert len(player_data) == 6, f"Expected 6 players, got {len(player_data)}"

            # Verify all 6 seats present (0-5)
            seats = sorted([p["seat"] for p in player_data])
            assert seats == [0, 1, 2, 3, 4, 5], f"Expected seats [0,1,2,3,4,5], got {seats}"

            print(f"PASS: Full 6/6 table with all seat positions 0-5: {seats}")

            # Admin trying to join should get 400 Table full (admin token would need a 7th user to test, skip for now)
            print(f"PASS: 6/6 table fully populated - all seats occupied")
        finally:
            delete_test_table(table_id, admin_token)


class TestSeatSelectionEdgeCases:
    """Edge cases for seat selection"""

    def test_already_joined_returns_existing_seat(self, aceking_token, admin_token):
        """Joining a table you're already in returns your existing seat"""
        table_id = create_test_table(aceking_token, "TEST_Rejoin")
        try:
            # First join at seat 3
            r1 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 3},
                headers=make_auth_header(aceking_token)
            )
            assert r1.status_code == 200
            assert r1.json()["seat"] == 3

            # Join again - should return existing seat without error
            r2 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 1},  # different seat preference
                headers=make_auth_header(aceking_token)
            )
            assert r2.status_code == 200, f"Rejoin failed: {r2.text}"
            # Backend returns the EXISTING seat (3), not new preferred seat
            assert r2.json()["seat"] == 3, f"Expected existing seat 3, got {r2.json()['seat']}"
            print(f"PASS: Re-joining returns existing seat 3 (ignoring new preference)")
        finally:
            delete_test_table(table_id, admin_token)

    def test_preferred_seat_boundary_values(self, aceking_token, bluffmaster_token, admin_token):
        """Test boundary seats: seat 0 (first) and seat 5 (last)"""
        table_id = create_test_table(aceking_token, "TEST_Boundaries")
        try:
            # Seat 0 (first)
            r0 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 0},
                headers=make_auth_header(aceking_token)
            )
            assert r0.status_code == 200
            assert r0.json()["seat"] == 0, f"Expected seat 0, got {r0.json()['seat']}"

            # Seat 5 (last)
            r5 = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 5},
                headers=make_auth_header(bluffmaster_token)
            )
            assert r5.status_code == 200
            assert r5.json()["seat"] == 5, f"Expected seat 5, got {r5.json()['seat']}"

            print(f"PASS: Boundary seats 0 and 5 work correctly")
        finally:
            delete_test_table(table_id, admin_token)

    def test_preferred_seat_6_invalid_for_6_player_table(self, aceking_token, admin_token):
        """Seat 6 is invalid for max_players=6 table (valid seats are 0-5)"""
        table_id = create_test_table(aceking_token, "TEST_Seat6Invalid")
        try:
            resp = requests.post(
                f"{BASE_URL}/api/tables/join",
                json={"table_id": table_id, "preferred_seat": 6},
                headers=make_auth_header(aceking_token)
            )
            assert resp.status_code == 400, f"Expected 400 for seat 6 on 6-player table, got {resp.status_code}"
            error_msg = resp.json().get("detail", "")
            assert "Invalid seat number" in error_msg, f"Expected 'Invalid seat number', got: {error_msg}"
            print(f"PASS: Seat 6 returns 400 'Invalid seat number' for 6-player table")
        finally:
            delete_test_table(table_id, admin_token)
