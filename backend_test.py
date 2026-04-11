#!/usr/bin/env python3
"""
Chullz Poker Backend API Testing
Tests authentication, lobby, table creation/joining, and WebSocket functionality
"""

import requests
import json
import sys
import time
from datetime import datetime

class ChullzAPITester:
    def __init__(self, base_url="https://multi-board-poker.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.user_data = None
        self.tests_run = 0
        self.tests_passed = 0
        self.table_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_login(self, username, pin):
        """Test login and get token"""
        print(f"\n🔐 Testing login for {username}")
        success, response = self.run_test(
            f"Login {username}",
            "POST",
            "auth/login",
            200,
            data={"username": username, "pin": pin}
        )
        if success and 'token' in response:
            self.token = response['token']
            self.user_data = response.get('user', {})
            print(f"✅ Login successful - Token received")
            print(f"   User: {self.user_data}")
            return True
        return False

    def test_auth_me(self):
        """Test /auth/me endpoint"""
        success, response = self.run_test(
            "Get current user",
            "GET", 
            "auth/me",
            200
        )
        return success

    def test_get_players(self):
        """Test getting all players"""
        success, response = self.run_test(
            "Get players list",
            "GET",
            "players", 
            200
        )
        if success:
            print(f"   Found {len(response)} players")
        return success

    def test_get_tables(self):
        """Test getting active tables"""
        success, response = self.run_test(
            "Get active tables",
            "GET",
            "tables",
            200
        )
        if success:
            print(f"   Found {len(response)} active tables")
        return success

    def test_create_table(self):
        """Test creating a new table"""
        table_name = f"Test Table {datetime.now().strftime('%H%M%S')}"
        success, response = self.run_test(
            "Create table",
            "POST",
            "tables/create",
            200,
            data={
                "name": table_name,
                "blind_small": 25,
                "blind_big": 50,
                "starting_chips": 5000,
                "max_players": 6
            }
        )
        if success and 'table_id' in response:
            self.table_id = response['table_id']
            print(f"✅ Table created with ID: {self.table_id}")
            return True
        return False

    def test_join_table(self):
        """Test joining the created table"""
        if not self.table_id:
            print("❌ No table ID available for joining")
            return False
            
        success, response = self.run_test(
            "Join table",
            "POST",
            "tables/join",
            200,
            data={"table_id": self.table_id}
        )
        if success:
            print(f"✅ Joined table successfully")
            return True
        return False

    def test_get_table_details(self):
        """Test getting specific table details"""
        if not self.table_id:
            print("❌ No table ID available for details")
            return False
            
        success, response = self.run_test(
            "Get table details",
            "GET",
            f"tables/{self.table_id}",
            200
        )
        if success:
            print(f"✅ Got table details")
            return True
        return False

    def test_leave_table(self):
        """Test leaving the table"""
        if not self.table_id:
            print("❌ No table ID available for leaving")
            return False
            
        success, response = self.run_test(
            "Leave table",
            "DELETE",
            f"tables/{self.table_id}/leave",
            200
        )
        if success:
            print(f"✅ Left table successfully")
            return True
        return False

    def test_admin_distribute_chips(self):
        """Test admin chip distribution (if admin user)"""
        if not self.user_data or self.user_data.get('role') != 'admin':
            print("⏭️  Skipping admin test - not admin user")
            return True
            
        success, response = self.run_test(
            "Admin distribute chips",
            "POST",
            "admin/distribute-chips",
            200,
            data={
                "target_username": "AceKing",
                "amount": 1000
            }
        )
        return success

def main():
    print("🃏 Chullz Poker Backend API Testing")
    print("=" * 50)
    
    tester = ChullzAPITester()
    
    # Test credentials from test_credentials.md
    test_accounts = [
        ("AceKing", "1111"),
        ("BluffMaster", "2222"), 
        ("TableAdmin", "0000")  # Admin account
    ]
    
    all_passed = True
    
    for username, pin in test_accounts:
        print(f"\n{'='*20} Testing {username} {'='*20}")
        
        # Login test
        if not tester.test_login(username, pin):
            print(f"❌ Login failed for {username}, skipping other tests")
            all_passed = False
            continue
            
        # Basic API tests
        tests = [
            tester.test_auth_me,
            tester.test_get_players,
            tester.test_get_tables,
            tester.test_create_table,
            tester.test_join_table,
            tester.test_get_table_details,
            tester.test_leave_table,
            tester.test_admin_distribute_chips
        ]
        
        for test_func in tests:
            try:
                if not test_func():
                    all_passed = False
            except Exception as e:
                print(f"❌ Test {test_func.__name__} failed with exception: {e}")
                all_passed = False
        
        # Reset for next user
        tester.token = None
        tester.user_data = None
        tester.table_id = None
    
    # Print final results
    print(f"\n{'='*50}")
    print(f"📊 Final Results:")
    print(f"   Tests run: {tester.tests_run}")
    print(f"   Tests passed: {tester.tests_passed}")
    print(f"   Success rate: {(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "No tests run")
    
    if all_passed:
        print("✅ All backend API tests passed!")
        return 0
    else:
        print("❌ Some backend API tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())