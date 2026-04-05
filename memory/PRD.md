# Poker Club App — PRD

## Original Problem Statement
Build a poker game app with PPPoker-style UI. Phase 1: Create simple testing profiles for multiplayer testing. The app is a multiplayer app that needs multiplayer testing.

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

### P0 — Core Gameplay (Next Phase)
- [ ] Texas Hold'em game engine (deal cards, betting rounds, hand evaluation)
- [ ] Real-time game state sync via WebSocket
- [ ] Multiple concurrent tables support
- [ ] Player actions: Fold, Check, Call, Raise, All-In

### P1 — Table Management
- [ ] Create Table with settings (buy-in, blind levels, max players)
- [ ] Join Table from lobby
- [ ] Spectator mode
- [ ] Table chat

### P2 — Polish
- [ ] Player avatars customization
- [ ] Hand history
- [ ] Tournament mode
- [ ] Statistics tracking (games played, win rate)
- [ ] Admin: reset all chips to default

## Tech Notes
- WebSocket endpoint: `/api/ws/{user_id}` — connects on lobby mount, disconnects on unmount
- CORS currently `allow_origins=["*"]` — update for production
- All PINs are bcrypt-hashed in MongoDB
- Token TTL: 7 days
