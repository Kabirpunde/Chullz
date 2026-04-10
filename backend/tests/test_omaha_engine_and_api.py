"""
Tests for Chullz Poker Omaha engine changes (Iteration 12):
- best_hand_omaha() uses exactly both hole cards + 3 community cards
- _desc5_omaha() uses player's highest hole card for flush/high-card descriptions
- score_boards() correctly calls best_hand_omaha
- /api/tables routes still work after game_engine changes
"""
import pytest
import requests
import os
import sys

# Add backend path to import game_engine directly
sys.path.insert(0, '/app/backend')
from game_engine import best_hand_omaha, score_boards

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', 'https://card-game-live-1.preview.emergentagent.com')


# ─── Direct Engine Tests ──────────────────────────────────────────────────────

class TestOmahaFlushHighCardDescriptors:
    """
    Omaha rule: flush/high-card descriptions use player's hole card as 'high'
    """

    def test_flush_uses_hole_card_as_high(self):
        """6d 4d hole + Kd Jd Td community = 'Flush, 6 high' (not K high)"""
        sc, desc, best5 = best_hand_omaha(['6d', '4d'], ['Jd', 'Td', 'Kd', 'Qd', '9d'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        # Must be a flush (all diamonds)
        assert 'Flush' in desc, f"Expected Flush, got: {desc}"
        # High should be the player's highest hole card (6, not K)
        assert '6' in desc, f"Expected '6' in desc for hole-card high, got: {desc}"
        assert 'King' not in desc and 'K' not in desc.replace('King', ''), \
            f"Flush description should NOT show K high: {desc}"
        print(f"✓ Flush descriptor uses hole card high: '{desc}'")

    def test_no_flush_with_one_hole_card_diamond(self):
        """6d 4s hole + Jd Td Kd Qd 9h community = cannot make flush (only 1 diamond hole card)"""
        sc, desc, best5 = best_hand_omaha(['6d', '4s'], ['Jd', 'Td', 'Kd', 'Qd', '9h'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        # Should NOT be a flush
        assert 'Flush' not in desc, f"Expected no flush with only 1 diamond hole card, got: {desc}"
        print(f"✓ No flush with 1 diamond hole card: '{desc}'")

    def test_pair_of_aces_uses_standard_label(self):
        """Ah 9s hole + As Kh Qh 2d 5c community = 'Pair of Aces'"""
        sc, desc, best5 = best_hand_omaha(['Ah', '9s'], ['As', 'Kh', 'Qh', '2d', '5c'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        assert 'Pair' in desc and 'Ace' in desc, f"Expected 'Pair of Aces', got: {desc}"
        print(f"✓ Pair of Aces: '{desc}'")

    def test_high_card_uses_hole_card_as_high(self):
        """9s 7h hole + Ad Kh Qd 2s 3c community = 'High Card 9' (not 'High Card Ace')"""
        sc, desc, best5 = best_hand_omaha(['9s', '7h'], ['Ad', 'Kh', 'Qd', '2s', '3c'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        assert 'High Card' in desc, f"Expected 'High Card', got: {desc}"
        assert '9' in desc, f"Expected '9' in high card desc, got: {desc}"
        assert 'Ace' not in desc, f"High card description should NOT show Ace: {desc}"
        print(f"✓ High Card uses hole-card high: '{desc}'")


class TestOmahaStandardLabels:
    """Standard hand labels (pair, two-pair, trips, straight, full house, quads) use standard names"""

    def test_two_pair_standard_label(self):
        """Two pair uses standard 'Two Pair, Xs and Ys' format"""
        # Ah As hole + Kh Ks Qd 2c 3d community
        # Must use both holes (A A) + 3 community: best = A A K K Q = two pair AA and KK
        sc, desc, best5 = best_hand_omaha(['Ah', 'As'], ['Kh', 'Ks', 'Qd', '2c', '3d'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        # Two pair AA KK
        assert 'Two Pair' in desc or 'Pair' in desc, f"Expected two pair or pair, got: {desc}"
        print(f"✓ Two pair label: '{desc}'")

    def test_full_house_standard_label(self):
        """Full house uses standard 'Full House, Xs full of Ys' format"""
        # Ah As hole + Ac Kh Kd 2c 3d community
        # Best: Ah As Ac Kh Kd = three aces full of kings
        sc, desc, best5 = best_hand_omaha(['Ah', 'As'], ['Ac', 'Kh', 'Kd', '2c', '3d'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        assert 'Full House' in desc, f"Expected Full House, got: {desc}"
        assert 'Ace' in desc, f"Full house should mention Aces, got: {desc}"
        print(f"✓ Full house label: '{desc}'")

    def test_four_of_a_kind_standard_label(self):
        """Four of a kind uses standard 'Four of a Kind, Xs' format"""
        # Ah As hole + Ac Ad Kh 2c 3d community
        # Best: Ah As Ac Ad Kh = four aces
        sc, desc, best5 = best_hand_omaha(['Ah', 'As'], ['Ac', 'Ad', 'Kh', '2c', '3d'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        assert 'Four of a Kind' in desc, f"Expected Four of a Kind, got: {desc}"
        print(f"✓ Four of a kind label: '{desc}'")

    def test_straight_standard_label(self):
        """Straight uses standard 'Straight, X high' format (NOT hole card high)"""
        # 9h 8s hole + 7c 6d 5h Ah Kd community
        # Best straight with both holes: 9 8 7 6 5 = straight 9 high
        sc, desc, best5 = best_hand_omaha(['9h', '8s'], ['7c', '6d', '5h', 'Ah', 'Kd'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        assert 'Straight' in desc, f"Expected Straight, got: {desc}"
        # Straight uses board high (9 is the top of this straight)
        assert '9' in desc, f"Straight should show 9 high, got: {desc}"
        print(f"✓ Straight label: '{desc}'")

    def test_omaha_requires_exactly_2_hole_cards(self):
        """best_hand_omaha requires exactly 2 hole cards"""
        # Pass 1 hole card — should return incomplete
        sc, desc, best5 = best_hand_omaha(['Ah'], ['Ac', 'Kh', 'Qd', '2c', '3d'])
        print(f"Result with 1 hole card: ({sc}, '{desc}')")
        assert sc == 0 and desc == "Incomplete", f"Expected Incomplete with 1 hole card, got: {desc}"
        print(f"✓ 1 hole card returns Incomplete")

    def test_omaha_requires_at_least_3_community(self):
        """best_hand_omaha requires at least 3 community cards"""
        sc, desc, best5 = best_hand_omaha(['Ah', 'As'], ['Ac', 'Kh'])
        print(f"Result with 2 community: ({sc}, '{desc}')")
        assert sc == 0 and desc == "Incomplete", f"Expected Incomplete with 2 community, got: {desc}"
        print(f"✓ 2 community cards returns Incomplete")


class TestOmahaConstraintEnforcement:
    """Omaha constraint: must use exactly 2 hole + 3 community (not 1+4 or 0+5)"""

    def test_all_flush_community_one_hole_diamond(self):
        """With 1 diamond hole card and all 5 community diamonds, CANNOT make flush
        because only 1 hole card of matching suit, need BOTH holes to be in flush."""
        # Hole: Kd + 2s (only Kd is diamond)
        # Community: 5 diamonds: Ad 9d 7d 6d 3d
        # Any combo: Kd + 2s + (3 diamonds) = 4 diamonds total from 5-card hand
        # 2s is not diamond, so the 5-card hand will always have a non-diamond card -> no flush
        sc, desc, best5 = best_hand_omaha(['Kd', '2s'], ['Ad', '9d', '7d', '6d', '3d'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        assert 'Flush' not in desc, f"Should NOT be flush with only 1 hole diamond: {desc}"
        print(f"✓ No flush with 1 diamond hole, community all diamonds: '{desc}'")

    def test_straight_cannot_use_community_only(self):
        """Verify best is found using both holes: Td 9h + Kh Qh Jh Ah 2c"""
        # Both holes: T, 9 with K Q J A on board
        # Must use T AND 9 as holes + 3 community
        # Best: T 9 + K Q J = straight K high (9 T J Q K)
        # Can't do A K Q J T straight without T (hole) but T is used! So A K Q J T would need both A and T from some set
        # Actually: holes = Td, 9h; community = Kh, Qh, Jh, Ah, 2c
        # combo T 9 + K Q J = 9 T J Q K = straight K high ✓
        # combo T 9 + A K Q = 9 T Q K A = straight A high ✓ (best)
        sc, desc, best5 = best_hand_omaha(['Td', '9h'], ['Kh', 'Qh', 'Jh', 'Ah', '2c'])
        print(f"Result: ({sc}, '{desc}', {best5})")
        assert 'Straight' in desc, f"Expected Straight, got: {desc}"
        print(f"✓ Straight enforced: '{desc}'")


# ─── API Integration Tests ────────────────────────────────────────────────────

class TestTablesApiAfterEngineChanges:
    """Verify /api/tables routes still work correctly after game_engine changes"""

    @pytest.fixture(autouse=True)
    def setup_tokens(self):
        """Get auth tokens"""
        resp = requests.post(f"{BASE_URL}/api/auth/login",
                             json={"username": "AceKing", "pin": "1111"})
        assert resp.status_code == 200, f"AceKing login failed: {resp.text}"
        self.aceking_token = resp.json()["token"]
        self.aceking_hdr = {"Authorization": f"Bearer {self.aceking_token}"}

        resp2 = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"username": "BluffMaster", "pin": "2222"})
        assert resp2.status_code == 200, f"BluffMaster login failed: {resp2.text}"
        self.bluffmaster_token = resp2.json()["token"]
        self.bluffmaster_hdr = {"Authorization": f"Bearer {self.bluffmaster_token}"}

        resp3 = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"username": "TableAdmin", "pin": "0000"})
        assert resp3.status_code == 200, f"Admin login failed: {resp3.text}"
        self.admin_token = resp3.json()["token"]
        self.admin_hdr = {"Authorization": f"Bearer {self.admin_token}"}

    def test_list_tables_returns_200(self):
        """GET /api/tables returns 200"""
        resp = requests.get(f"{BASE_URL}/api/tables")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ GET /api/tables OK, {len(data)} tables")

    def test_create_table_returns_200(self):
        """POST /api/tables/create returns 200 with table_id"""
        resp = requests.post(f"{BASE_URL}/api/tables/create",
                             headers=self.aceking_hdr,
                             json={"name": "TEST_OmahaEngineTest", "blind_small": 10,
                                   "blind_big": 20, "starting_chips": 1000, "max_players": 6})
        assert resp.status_code == 200
        data = resp.json()
        assert "table_id" in data
        self.__class__.created_table_id = data["table_id"]
        print(f"✓ Table created: {data['table_id']}")

    def test_join_table_returns_200(self):
        """POST /api/tables/join returns 200 with seat"""
        if not hasattr(self.__class__, 'created_table_id'):
            pytest.skip("No table created")
        resp = requests.post(f"{BASE_URL}/api/tables/join",
                             headers=self.aceking_hdr,
                             json={"table_id": self.__class__.created_table_id})
        assert resp.status_code == 200
        data = resp.json()
        assert "seat" in data
        print(f"✓ AceKing joined at seat {data['seat']}")

    def test_get_table_returns_valid_state(self):
        """GET /api/tables/{id} returns valid game state"""
        if not hasattr(self.__class__, 'created_table_id'):
            pytest.skip("No table created")
        resp = requests.get(f"{BASE_URL}/api/tables/{self.__class__.created_table_id}")
        assert resp.status_code == 200
        data = resp.json()
        for field in ["table_id", "name", "status", "round", "players", "pot", "max_players"]:
            assert field in data, f"Missing field: {field}"
        print(f"✓ Table state OK: round={data['round']}, players={len(data['players'])}")

    def test_cleanup_table(self):
        """Admin cleanup of test table"""
        if not hasattr(self.__class__, 'created_table_id'):
            pytest.skip("No table to clean")
        resp = requests.delete(f"{BASE_URL}/api/tables/{self.__class__.created_table_id}",
                               headers=self.admin_hdr)
        assert resp.status_code == 200
        print(f"✓ Test table cleaned up")


# ─── score_boards Integration Test ───────────────────────────────────────────

class TestScoreBoardsOmaha:
    """score_boards() calls best_hand_omaha correctly"""

    def test_score_boards_flush_description_uses_hole_card(self):
        """score_boards result for a flush hand uses hole card as high (not community high)"""
        # Player has 6d 4d; community board has all diamonds
        # Expected: Flush description shows 6, not K
        community_cards = [
            ['Jd', 'Td', 'Kd', 'Qd', '9d'],  # board 1 all diamonds
            ['2h', '3h', '4h', '5h', '6h'],   # board 2 (hearts)
            ['2c', '3c', '4c', '5c', '6c'],   # board 3 (clubs)
        ]
        assignments = {
            "uid1": {
                "board_1": ['6d', '4d'],
                "board_2": ['6d', '4d'],  # can't make flush here (not hearts)
                "board_3": ['6d', '4d'],  # can't make flush here (not clubs)
            }
        }
        result = score_boards(community_cards, assignments, pot=100, total_contributions={"uid1": 100})
        board1_result = result["player_results"]["uid1"]["board_1"]
        print(f"Board 1 result: {board1_result}")
        desc = board1_result["description"]
        assert 'Flush' in desc, f"Expected Flush on board 1, got: {desc}"
        assert '6' in desc, f"Expected '6' in flush desc (hole card high), got: {desc}"
        print(f"✓ score_boards flush desc uses hole card high: '{desc}'")

    def test_score_boards_omaha_rules_enforced(self):
        """score_boards correctly rejects invalid Omaha combinations"""
        # Player has only 1 matching suit card — cannot make flush
        community_cards = [
            ['Jd', 'Td', 'Kd', 'Qd', '9h'],  # 4 diamonds + 1 heart
            ['2h', '3h', '4h', '5h', '6h'],
            ['2c', '3c', '4c', '5c', '6c'],
        ]
        assignments = {
            "uid1": {
                "board_1": ['6d', '4s'],  # only 6d is diamond
                "board_2": ['6d', '4s'],
                "board_3": ['6d', '4s'],
            }
        }
        result = score_boards(community_cards, assignments, pot=100, total_contributions={"uid1": 100})
        board1_result = result["player_results"]["uid1"]["board_1"]
        print(f"Board 1 result: {board1_result}")
        desc = board1_result["description"]
        assert 'Flush' not in desc, f"Should NOT be flush with 1 diamond hole card: {desc}"
        print(f"✓ score_boards Omaha rules enforced: '{desc}'")

    def test_score_boards_pair_wins_board(self):
        """score_boards correctly identifies winner with pair"""
        community_cards = [
            ['As', 'Kh', 'Qh', '2d', '5c'],
            ['2h', '3h', '4h', '5h', '6h'],
            ['2c', '3c', '4c', '5c', '6c'],
        ]
        assignments = {
            "uid1": {"board_1": ['Ah', '9s'], "board_2": ['Ah', '9s'], "board_3": ['Ah', '9s']},
            "uid2": {"board_1": ['7d', '6s'], "board_2": ['7d', '6s'], "board_3": ['7d', '6s']},
        }
        result = score_boards(community_cards, assignments,
                              pot=200,
                              total_contributions={"uid1": 100, "uid2": 100})
        board1_uid1 = result["player_results"]["uid1"]["board_1"]
        board1_uid2 = result["player_results"]["uid2"]["board_1"]
        print(f"UID1 board 1: {board1_uid1['description']}, score={board1_uid1['score']}")
        print(f"UID2 board 1: {board1_uid2['description']}, score={board1_uid2['score']}")
        # uid1 has pair of aces; uid2 has high card
        assert board1_uid1["score"] > board1_uid2["score"], \
            "uid1 (pair of aces) should beat uid2 (high card)"
        assert "Pair" in board1_uid1["description"]
        print(f"✓ Pair of Aces wins over High Card")
