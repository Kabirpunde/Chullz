# Chullz Poker - Product Requirements Document

## Original Problem Statement
Build "Chullz" — a real-time multiplayer online poker variant with 3 independent community boards.
Rules: 6 hole cards dealt face-up to player; players assign 2 cards to each of 3 boards (1 minute);
Pot Limit betting (25%/33%/50%/66%/75%/100% pot presets + slider); 1 point per board won;
most points wins the pot (ties split). Use FastAPI + WebSocket backend, React Native (Expo) frontend,
PPPoker dark theme, and 7 pre-seeded test accounts.

**User Personas:** Casual friend groups playing custom poker online via mobile browser.

## Architecture
- **Frontend:** React + Vite PWA (`/app/web/`) served via **Vite preview** on port 3000
  - Supervisor runs `yarn start` → wrapper script that builds `/app/web` if no `dist/`, then starts `vite preview`
  - Zero HMR, zero file watching — static `dist/` bundle
  - Max-width 480px centered, responsive with `dvh`/`vw` units
- **Backend:** FastAPI + WebSockets (`/app/backend/server.py` + `game_engine.py`) on port 8001
- **Database:** MongoDB (local) with 7 pre-seeded user accounts
- **Routing:** Kubernetes nginx ingress: `/api/*` → port 8001, `/` → port 3000

## Core Requirements
1. Multiplayer real-time poker via WebSockets
2. 3 independent community boards (each has Flop/Turn/River)
3. Players get 6 hole cards, assign 2 to each of 3 boards
4. Pot Limit betting with preset buttons + slider
5. Scoring: 1 point per board won, most points wins pot
6. Mobile-first web app (no app store needed)

## User Credentials (Test Accounts)
| Username | PIN | Role |
|---|---|---|
| AceKing | 1111 | player |
| BluffMaster | 2222 | player |
| CardShark | 3333 | player |
| PokerPro | 4444 | player |
| AllInAndy | 5555 | player |
| HighRoller | 6666 | player |
| TableAdmin | 0000 | admin |

## What's Been Implemented

### Phase 1 (initial build)
- Profile selection with PIN authentication
- Multiplayer lobby with online player tracking
- Table creation and joining
- Real-time WebSocket game updates
- 3-board poker variant (Chullz rules)
- Card assignment phase with drag-to-reorder
- Pot-limit betting with preset buttons (Fold/Call/Raise)
- Turn timer countdown (30s for actions, 60s for assignments)
- Showdown and scoring system with winner overlay
- Mobile-first PWA design

### Phase 2 (fixes & polish)
- Fixed WebSocket message type mismatch
- Timer changed to receding circle around active player
- Sound mute/unmute toggle
- Admin table delete with confirmation
- Connection persistence (ping/pong keepalive, auto-reconnect)
- Auto-fold/check when 30s timer expires
- Return to Table button in lobby
- PWA disabled to prevent mid-game refresh
- Disbanded table modal with countdown

### Phase 3 (P0/P1/P2 — 2026-05-xx)
- **P0: Showdown overlay auto-closes** — changed close condition to `gs.round !== 'showdown'` (was `preflop || waiting`)
- **P0: Timer resets to 30s per player** — `_start_timer` called BEFORE `_broadcast_state` in `_start_hand`, `_apply_action`, `_advance_round`
- **P1: Spectator Mode** — Lobby shows "👁 View Table" navigating without joining; PokerTable detects spectators (`isSpectator = !!gameState && !myPlayer`); empty seats show "Take Seat" buttons; spectator indicator at bottom; "SPECTATING" badge; "Take Seat" calls `POST /api/tables/join` which now allows mid-game joins (sitting_out for current hand, active next hand)
- **P2: Auto-action warning** — Banner when `timeLeft <= 5 && isMyTurn` shows "Auto-folding/checking in Xs"
- **P2: Admin kick player** — `POST /api/tables/{table_id}/kick/{uid}` endpoint; ✕ button on each opponent seat for admin; WS close code 4003; kicked modal

## Key Technical Notes
- `holeCards` removed from `connectWebSocket` deps (was causing spurious WS reconnects); use `holeCardsRef` instead
- `ready_next_hand` WS handler now checks only player connections (not spectators) for "all ready" check
- `join_table` REST endpoint no longer blocks mid-game joins

## Remaining / Upcoming Tasks

### Phase 4 (Rules & UX — 2026-05-xx)
- **Inline Assignment** — confirm button inline on main table; drag-to-swap works in-place
- **Omaha Rules** — `best_hand_omaha()` exactly 2 hole + 3 community; single-card flushes impossible
- **Player-relative descriptions** — hole card high for flush/high-card
- **Game History & Stats** — `/history` page, leaderboard, per-hand P&L, `/api/history` + `/api/stats`
- **MongoDB Persistence** — tables persist across backend restarts; hand history logged per completed hand

### Phase 5 (Live Preview — 2026-05-xx)
- **Live Hand Strength Badges** — `bestHandOmaha()` in `handEvaluator.ts`; 3 reactive badges under hole cards during flop/turn/river/assignment; Omaha shorthand; hole-card-relative high labels

### Phase 8 (2026-02)
- **Bankroll + Top-up system** — `db.users.chips` = bankroll; `POST /api/tables/{id}/topup` deducts from bankroll, adds to in-game chips; max = max(largest stack, starting_chips). Blocking modal when chips = 0; always-visible Rebuy button otherwise.
- **Sit Out / Come Back / Leave Table** — Small buttons above action bar. `wants_sitout` flag on `GPlayer`; `_start_hand` skips sitting-out players. WS `toggle_sitout` message. `leave_table` now broadcasts state.
- **Admin Panel** — `/admin` page: all players with bankroll + quick chip amounts + custom input. "Admin" button in lobby header for admin users.
- **Admin give-chips at table** — Green `+` button per opponent for admin; `POST /api/tables/{id}/admin/give-chips/{uid}` adds to in-game + bankroll.
- **Pot display on felt** — Pot moved from top bar to inside oval felt below boards (shows total = pot + current street bets).
- **SB/BB/D inline badges** — Small colored pills below player chips (D=gray, SB=amber, BB=cyan); standalone overlapping D button removed
- **Effective stack betting** — `valid_actions` gains `opp_max` param; raise/all-in capped at max any non-folded opponent can commit; prevents dead-money bets and refunds
- **History page card graphics** — Board community cards and per-player assigned hole cards now shown as `PlayingCard` graphics; backend saves `hole_cards_revealed` + `assignments` to hand_history
- **Clockwise seat layout** — `SEAT_ANGLES` reordered clockwise; `opponents` array built from `(mySeat+1+i)%maxP` for correct spatial consistency
- **Assignment/vote reconnect fix** — `pendingAssignmentRef` + `pendingVoteRef` for auto-re-send; server-truth sync in game_state handler
- **Turn order visual fix** — `SEAT_ANGLES` reordered to clockwise from bottom `[135, -135, -90, -45, 0]`; opponents array now built by `(mySeat+1+i)%maxP` so turn indicator travels clockwise and all players share a consistent spatial layout
- **Assignment stuck at 2/3** — `pendingAssignmentRef` in PokerTable.tsx: game_state handler now syncs `submitting` with server truth on every WS message; auto-re-sends pending assignment after reconnect
- **Vote stuck at 2/3** — `pendingVoteRef` in PokerTable.tsx: game_state handler now syncs `readyVoted` with server truth on every WS message; auto-re-sends pending vote after reconnect
- **Sitting_out quorum bug** — Backend `ready_next_hand` now uses `participated_uids` (excludes `sitting_out`) for quorum; frontend ShowdownOverlay denominator also excludes `sitting_out`
- **AssignmentPanel.tsx deleted** — Component was unused; `Assignment` type moved inline to `PokerTable.tsx`

### P3 Future / Backlog
- AI bot player for solo practice
- Quick Match auto-matchmaking
- Kick Player from lobby (not just inside a table)
