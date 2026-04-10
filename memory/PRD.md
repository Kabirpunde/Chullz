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

### P3 Future / Backlog
- Game history/stats tracking dashboard
- AI bot player for solo practice  
- Quick Match auto-matchmaking
- Move game state from in-memory → MongoDB (production resilience)
- "Kick Player" from lobby (not just from inside table)
