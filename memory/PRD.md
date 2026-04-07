# Chullz Poker - Product Requirements Document

## Original Problem Statement
Build "Chullz" — a real-time multiplayer online poker variant with 3 independent community boards.
Rules: 6 hole cards dealt face-up to player; players assign 2 cards to each of 3 boards (1 minute);
Pot Limit betting (25%/33%/50%/66%/75%/100% pot presets + slider); 1 point per board won;
most points wins the pot (ties split). Use FastAPI + WebSocket backend, React Native (Expo) frontend,
PPPoker dark theme, and 7 pre-seeded test accounts.

**User Personas:** Casual friend groups playing custom poker online via mobile browser.

## Architecture
- **Frontend:** React + Vite PWA (`/app/web/`) served via Vite dev server on port 3000
  - Expo binary replaced with wrapper script pointing to Vite
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
