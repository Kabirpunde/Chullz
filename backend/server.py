from dotenv import load_dotenv
load_dotenv()

import os
import jwt
import bcrypt
import json
import logging
from fastapi import FastAPI, APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT_DIR = Path(__file__).parent
mongo_url = os.environ["MONGO_URL"]
db_name = os.environ.get("DB_NAME", "poker_game")
JWT_SECRET = os.environ.get("JWT_SECRET", "poker-dev-secret-key-for-testing")
JWT_ALGORITHM = "HS256"

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ── WebSocket Presence Manager ────────────────────────────────────────────────
class ConnectionManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}

    async def connect(self, user_id: str, ws: WebSocket):
        await ws.accept()
        self.connections[user_id] = ws
        await self.broadcast_presence()

    def disconnect(self, user_id: str):
        self.connections.pop(user_id, None)

    async def broadcast_presence(self):
        online_ids = list(self.connections.keys())
        msg = json.dumps({"type": "presence", "online_users": online_ids})
        dead = []
        for uid, ws in list(self.connections.items()):
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(uid)
        for uid in dead:
            self.connections.pop(uid, None)

    def get_online_ids(self) -> List[str]:
        return list(self.connections.keys())


manager = ConnectionManager()


# ── Auth helpers ──────────────────────────────────────────────────────────────
def hash_pin(pin: str) -> str:
    return bcrypt.hashpw(pin.encode(), bcrypt.gensalt()).decode()


def verify_pin(pin: str, hashed: str) -> bool:
    return bcrypt.checkpw(pin.encode(), hashed.encode())


def create_token(user_id: str, username: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "id": str(user["_id"]),
            "username": user["username"],
            "avatar": user["avatar"],
            "avatar_color": user["avatar_color"],
            "role": user["role"],
            "chips": user["chips"],
        }
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Seed data ─────────────────────────────────────────────────────────────────
SEEDED_PLAYERS = [
    {"username": "AceKing",     "pin": "1111", "avatar": "🦁", "avatar_color": "#c9a227", "role": "player", "chips": 10000},
    {"username": "BluffMaster", "pin": "2222", "avatar": "🐺", "avatar_color": "#3b82f6", "role": "player", "chips": 10000},
    {"username": "CardShark",   "pin": "3333", "avatar": "🦊", "avatar_color": "#f97316", "role": "player", "chips": 10000},
    {"username": "PokerPro",    "pin": "4444", "avatar": "🐻", "avatar_color": "#6b4226", "role": "player", "chips": 10000},
    {"username": "AllInAndy",   "pin": "5555", "avatar": "🦅", "avatar_color": "#0891b2", "role": "player", "chips": 10000},
    {"username": "HighRoller",  "pin": "6666", "avatar": "🐯", "avatar_color": "#dc2626", "role": "player", "chips": 10000},
    {"username": "TableAdmin",  "pin": "0000", "avatar": "👑", "avatar_color": "#7c3aed", "role": "admin",  "chips": 999999},
]


async def seed_players():
    for p in SEEDED_PLAYERS:
        existing = await db.users.find_one({"username": p["username"]})
        if not existing:
            await db.users.insert_one({
                "username": p["username"],
                "pin_hash": hash_pin(p["pin"]),
                "avatar": p["avatar"],
                "avatar_color": p["avatar_color"],
                "role": p["role"],
                "chips": p["chips"],
                "created_at": datetime.now(timezone.utc),
            })
    logger.info("Players seeded successfully")


# ── Models ────────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    pin: str


class DistributeChipsRequest(BaseModel):
    target_username: str
    amount: int


# ── Routes ────────────────────────────────────────────────────────────────────
@api_router.get("/")
async def root():
    return {"message": "Poker Club API"}


@api_router.post("/auth/login")
async def login(req: LoginRequest):
    user = await db.users.find_one({"username": req.username})
    if not user or not verify_pin(req.pin, user["pin_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or PIN")
    uid = str(user["_id"])
    token = create_token(uid, user["username"], user["role"])
    return {
        "token": token,
        "user": {
            "id": uid,
            "username": user["username"],
            "avatar": user["avatar"],
            "avatar_color": user["avatar_color"],
            "role": user["role"],
            "chips": user["chips"],
        },
    }


@api_router.get("/auth/me")
async def me(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"_id": ObjectId(current_user["id"])})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": str(user["_id"]),
        "username": user["username"],
        "avatar": user["avatar"],
        "avatar_color": user["avatar_color"],
        "role": user["role"],
        "chips": user["chips"],
    }


@api_router.get("/players")
async def get_players():
    online_ids = manager.get_online_ids()
    players = await db.users.find({}, {"pin_hash": 0}).to_list(100)
    return [
        {
            "id": str(p["_id"]),
            "username": p["username"],
            "avatar": p["avatar"],
            "avatar_color": p["avatar_color"],
            "role": p["role"],
            "chips": p["chips"],
            "online": str(p["_id"]) in online_ids,
        }
        for p in players
    ]


@api_router.post("/admin/distribute-chips")
async def distribute_chips(
    req: DistributeChipsRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    result = await db.users.update_one(
        {"username": req.target_username},
        {"$inc": {"chips": req.amount}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Player not found")
    updated = await db.users.find_one({"username": req.target_username})
    return {"success": True, "username": req.target_username, "new_chips": updated["chips"]}


@api_router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id)
        await manager.broadcast_presence()


# ── App setup ─────────────────────────────────────────────────────────────────
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await seed_players()
    await db.users.create_index("username", unique=True)
    creds = Path("/app/memory/test_credentials.md")
    creds.parent.mkdir(parents=True, exist_ok=True)
    creds.write_text(
        """# Poker App – Test Credentials

## Pre-seeded Test Accounts

| Username     | PIN  | Role   | Starting Chips |
|--------------|------|--------|----------------|
| AceKing      | 1111 | player | 10,000         |
| BluffMaster  | 2222 | player | 10,000         |
| CardShark    | 3333 | player | 10,000         |
| PokerPro     | 4444 | player | 10,000         |
| AllInAndy    | 5555 | player | 10,000         |
| HighRoller   | 6666 | player | 10,000         |
| TableAdmin   | 0000 | admin  | 999,999        |

## API Endpoints
- POST /api/auth/login      → { username, pin }
- GET  /api/auth/me         → Bearer token required
- GET  /api/players         → Public list with online status
- POST /api/admin/distribute-chips → { target_username, amount } (Admin only)
- WS   /api/ws/{user_id}   → Presence WebSocket
"""
    )
    logger.info("Poker Club startup complete")


@app.on_event("shutdown")
async def shutdown():
    client.close()
