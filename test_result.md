#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Build "Chullz" — a real-time multiplayer online poker variant with 3 independent community boards.
  Rules: 6 hole cards dealt face-up to player; players assign 2 cards to each of 3 boards (1 minute);
  Pot Limit betting (25%/33%/50%/66%/75%/100% pot presets + slider); 1 point per board won; 
  most points wins the pot (ties split). Use existing FastAPI + WebSocket backend, React Native (Expo) 
  frontend, PPPoker dark theme, and 7 pre-seeded test accounts.

backend:
  - task: "Game Engine - 3-board Chullz logic with Pot Limit"
    implemented: true
    working: true
    file: "/app/backend/game_engine.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "game_engine.py has full Chullz logic: 3 boards, pot-limit, hand evaluation, auto-assign, scoring"

  - task: "WebSocket server with game state broadcasting"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "server.py handles create/join/leave tables, WebSocket game flow, all messages types"

  - task: "Table create/join/leave REST endpoints"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "POST /api/tables/create, POST /api/tables/join, DELETE /api/tables/{id}/leave all implemented"

  - task: "Authentication with 7 pre-seeded test accounts"
    implemented: true
    working: true
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Auth working with AceKing/1111, BluffMaster/2222, etc."

frontend:
  - task: "Lobby with table list, create table modal, and join table"
    implemented: true
    working: true
    file: "/app/frontend/app/(main)/lobby.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Lobby shows online players, table list (fetches from /api/tables), create table modal with name input, join table button. Verified visually."

  - task: "Poker table screen with WebSocket game state"
    implemented: true
    working: true
    file: "/app/frontend/app/poker-table.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Full poker table with WS connection, player list, community boards, hole cards, action bar, start game button. Visually verified in waiting state."

  - task: "3 Community Boards display (CommunityBoard component)"
    implemented: true
    working: "NA"
    file: "/app/frontend/components/CommunityBoard.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "CommunityBoard component exists. Shows boards during preflop/flop/turn/river. Needs actual game play to test."

  - task: "Pot Limit betting with RaiseControl component"
    implemented: true
    working: "NA"
    file: "/app/frontend/components/RaiseControl.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "RaiseControl has 25/33/50/66/75/100% pot presets + slider + custom input. Needs game play to test."

  - task: "Card Assignment Phase UI (AssignmentPanel component)"
    implemented: true
    working: "NA"
    file: "/app/frontend/components/AssignmentPanel.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "AssignmentPanel: 6 hole cards (tap to select + drag to board), 3 boards with 2 slots each, live hand preview, 60s countdown timer, submit button. Needs game play to test."

  - task: "Showdown overlay display (ShowdownOverlay component)"
    implemented: true
    working: "NA"
    file: "/app/frontend/components/ShowdownOverlay.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "ShowdownOverlay: board winners, hand descriptions, points per player, chips won/lost, auto-close 8s. Needs game play to test."

  - task: "PlayerSeat component"
    implemented: true
    working: true
    file: "/app/frontend/components/PlayerSeat.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "PlayerSeat shows avatar, chips, bet, status, dealer/SB/BB badges. Verified in waiting state."

metadata:
  created_by: "main_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: true

test_plan:
  current_focus:
    - "Lobby with table list, create table modal, and join table"
    - "Poker table screen with WebSocket game state"
    - "3 Community Boards display (CommunityBoard component)"
    - "Pot Limit betting with RaiseControl component"
    - "Card Assignment Phase UI (AssignmentPanel component)"
    - "Showdown overlay display (ShowdownOverlay component)"
  stuck_tasks: []
  test_all: true
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      I've implemented the full Chullz Phase 2 frontend including:
      1. Updated lobby.tsx: Real tables list from /api/tables, Create Table modal (with name input), join table flow
      2. Rewrote poker-table.tsx: Full WS game table with 3-board display, player seats, hole cards, action bar
      3. New AssignmentPanel.tsx: 1-minute card assignment with tap-to-select + drag-to-board, live hand preview, submit button
      4. New ShowdownOverlay.tsx: Board winners, points, chips won/lost display
      
      Test credentials:
      - AceKing: 1111 (use as host/player 1)
      - BluffMaster: 2222 (use as second player)
      - CardShark: 3333 (third player)
      
      To test multiplayer: Open 2 browser tabs. In tab 1: login as AceKing, Create Table "Test Game". In tab 2: login as BluffMaster, Join that table.
      Back in tab 1: click Start Game (need 2+ players). 
      Test betting actions (Fold/Check/Call/Raise) and pot-limit controls.
      After River: card assignment panel should appear (60s timer).
      After assignment: showdown overlay should display.
      
      All backend APIs are confirmed working from logs.