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
  - Supervisor runs `yarn start` → `expo start` → wrapper script at `/app/frontend/node_modules/.bin/expo`
  - Wrapper: builds `/app/web` if no `dist/`, then starts `vite preview` (zero HMR, zero file watching)
  - PWA manifest + service worker (installable on iOS/Android home screen)
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

## Vite Preview Fix (2026-04-09)
- **Problem:** Vite dev server was watching source files → file changes caused restart → game state lost
- **Previous workaround (commit 1573d39):** Added `hmr: false` + `watch: { ignored: ['**/**'] }` to `vite.config.ts`
- **Full fix:** Replaced expo binary at `/app/frontend/node_modules/.bin/expo` with wrapper script
  (`/app/frontend/start-vite.sh`) that runs `vite build` + `vite preview` instead of the dev server
- **Result:** Serves pre-built static `dist/` bundle — zero file watching, zero HMR, page never reloads

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

## What's Been Implemented (2026-04-09)
- ✅ Profile selection with PIN authentication
- ✅ Multiplayer lobby with online player tracking
- ✅ Table creation and joining
- ✅ Real-time WebSocket game updates
- ✅ 3-board poker variant (Chullz rules)
- ✅ Card assignment phase with drag-to-reorder
- ✅ Pot-limit betting with preset buttons (Fold/Call/Raise)
- ✅ Raise slider with amount selection
- ✅ Turn timer countdown (30s for actions, 60s for assignments)
- ✅ Showdown and scoring system with winner overlay
- ✅ Mobile-first PWA design

## Fixed Issues (2026-04-09)
- Fixed WebSocket message type mismatch ('your_turn' vs 'valid_actions')
- Action buttons (Fold/Call/Raise) now display correctly when it's player's turn
- Switched frontend from React Native Expo to Vite web app
- Timer now shows as receding circle around active player's avatar
- Added mute/unmute button at top right for sound control
- Increased community board card sizes for better visibility
- Disabled PWA auto-update to prevent mid-game page refreshes
- Hole card ordering preserved - only resets when new cards are dealt

## Tech Stack
- **Frontend**: React + Vite + TypeScript (PWA)
- **Backend**: FastAPI + WebSockets
- **Database**: MongoDB
- **Auth**: JWT with PIN-based login

## Next Action Items
- Add sound effects toggle option
- Implement spectator mode
- Add game history/stats tracking
