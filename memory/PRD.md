# Chullz — Multiplayer Poker App PRD

## Original Problem Statement
Build "Chullz" — a real-time multiplayer Texas Hold'em variant with 3 independent community boards (Flop/Turn/River per board). Players get 6 hole cards (face-up). After River round, 1-minute card assignment phase where players assign 2 hole cards to each of 3 boards. Pot Limit betting (25/33/50/66/75/100% pot presets + slider). 1 point per board won; most points wins pot (ties split). Use existing FastAPI + WebSocket backend, React Native (Expo) frontend, 7 pre-seeded test accounts, PPPoker dark theme.

## Architecture
- **Frontend**: React Native Expo SDK 54 (expo-router v6, file-based routing)
- **Backend**: FastAPI + MongoDB (Motor async driver)
- **Real-time**: WebSocket for player presence/online status
- **Auth**: JWT Bearer tokens stored in AsyncStorage (pre-seeded accounts, no registration)

## Core Requirements (Static)
1. 6 pre-seeded player profiles + 1 admin profile
2. PIN-based login (no email/registration)
3. Admin can distribute/remove chips from any player
4. Real-time presence (online/offline indicator in lobby)
5. PPPoker-inspired dark UI: navy background, teal glow, oval green table

## What's Been Implemented (Phase 1 — April 2026)

### Backend
- JWT auth with username + 4-digit PIN
- Pre-seeded 7 accounts at startup (idempotent seeding)
- WebSocket connection manager for real-time presence broadcasts
- `GET /api/players` — public endpoint with online status
- `POST /api/auth/login` — returns JWT token
- `GET /api/auth/me` — returns current user from DB (refreshes chips)
- `POST /api/admin/distribute-chips` — admin-only chip distribution
- MongoDB index on `username` (unique)
- Auto-write test_credentials.md on startup

### Frontend Screens
1. **Select Profile** (`/(auth)/select-profile`) — 2-col grid of 7 avatar cards, PIN modal with custom numpad, shake animation on wrong PIN, haptic feedback
2. **Lobby** (`/(main)/lobby`) — real-time online players (WebSocket + 5s polling fallback), player list with chip counts, Create/Join Table buttons
3. **Profile** (`/(main)/profile`) — avatar, username, chip balance, stats placeholder, logout
4. **Admin Panel** (`/admin`) — player list, chip input per player, distribute/remove chips, success animation
5. **Poker Table** (`/poker-table`) — visual shell: oval green felt table with teal glow, 5 empty seats, community card area, Fold/Check/Raise buttons (UI only)

## Pre-seeded Accounts
| Username     | PIN  | Role   | Chips   |
|--------------|------|--------|---------|
| AceKing      | 1111 | player | 10,000  |
| BluffMaster  | 2222 | player | 10,000  |
| CardShark    | 3333 | player | 10,000  |
| PokerPro     | 4444 | player | 10,000  |
| AllInAndy    | 5555 | player | 10,000  |
| HighRoller   | 6666 | player | 10,000  |
| TableAdmin   | 0000 | admin  | 999,999 |

## Prioritized Backlog

### P0 — Core Gameplay (COMPLETE - Phase 2, April 2026)
- [x] Chullz 3-board game engine (deal 6 cards, 3 independent boards, pot-limit betting)
- [x] Real-time game state sync via WebSocket (/api/game/ws/{table_id}/{user_id})
- [x] Multiple concurrent tables support
- [x] Player actions: Fold, Check, Call, Raise, All-In (Pot Limit)
- [x] Card Assignment Phase (60s timer, tap-to-assign + drag-to-board)
- [x] Showdown scoring (1 point per board, chips awarded to winner)
- [x] Lobby with Create Table modal + Join Table flow
- [x] 3 fixed backend bugs: turn rotation, heads-up blind assignment, WS player-join sync
- [x] Visual green oval felt table restored with compact 90px design
- [x] All 3 community boards visible simultaneously (no scroll) below oval during game
- [x] AssignmentPanel: all 3 boards visible without horizontal scroll (flex-based layout)

### P1 — Remaining (Next Phase)
- [ ] Showdown overlay: full end-to-end test with both players completing assignment
- [ ] Add testIDs to AssignmentPanel for automated testing
- [ ] Table cleanup on WS disconnect (stale tables)
- [ ] Spectator mode
- [ ] Table chat

### P2 — Polish
- [ ] Card dealing animations
- [ ] Chip movement animations
- [ ] Hand history
- [ ] Player avatars customization
- [ ] Statistics tracking (games played, win rate)
- [ ] Admin: reset all chips

## Tech Notes
- WebSocket game: `/api/game/ws/{table_id}/{user_id}` — connects on table mount, auto-reconnects
- Lobby presence: `/api/ws/{user_id}` — connects on lobby mount
- Pot Limit buttons: 25/33/50/66/75/100% + slider + custom input
- Card Assignment: 3 boards × 2 slots = 6 total; tap or drag from 6 hole cards
- Assignment timeout: server auto-assigns random after 60s; frontend shows 60s countdown
- CORS currently `allow_origins=["*"]` — update for production
- All PINs are bcrypt-hashed in MongoDB
- Token TTL: 7 days
- game_rooms in-memory dict (reset on server restart) — intentional for session play
