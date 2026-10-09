"""Sync WebSocket tests (tasks 4.1/4.2/4.3; spec: plan-sync).

Auth is exercised over a real TestClient WebSocket with a test-only login route
that sets the session. Persistence, rehydration, and squash are exercised
directly against the sync server / store, since driving the full y-protocols by
hand is unnecessary here (the end-to-end sync is covered in integration).
"""
import asyncio
import sqlite3
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI, Request, WebSocket
from fastapi.testclient import TestClient
from pycrdt import Doc, Map
from starlette.middleware.sessions import SessionMiddleware
from starlette.websockets import WebSocketDisconnect

import plans
import spaces
import sync
import users
from migrations_runner import apply_migrations


@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    db = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", db)
    apply_migrations(db)
    # Fresh, isolated sync server per test.
    monkeypatch.setattr(sync, "sync_server", sync.PlanSyncServer())

    @asynccontextmanager
    async def lifespan(app):
        async with sync.lifespan_server():
            yield

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(SessionMiddleware, secret_key="test-secret", https_only=False)

    @app.get("/testlogin/{uid}")
    async def testlogin(request: Request, uid: str):
        request.session["user_id"] = uid
        return {"ok": True}

    @app.websocket("/sync/{plan_id}")
    async def ws(websocket: WebSocket, plan_id: str):
        await sync.serve_plan_socket(websocket, plan_id)

    return app, db


def _seed_plan(discord_id: str, plan_id: str) -> str:
    """Create a user, their Personal space, and a plan; return the user id."""
    async def go():
        user = await users.upsert_user(discord_id)
        space = await spaces.get_or_create_personal_space(user["id"])
        await plans.create_plan(plan_id, space["id"], "Alpha", "caucasus")
        return user["id"]

    return asyncio.run(go())


# --- 4.1 authorization -----------------------------------------------------

def test_authorized_connection_accepted(ctx):
    app, _db = ctx
    uid = _seed_plan("d-1", "pA")
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with client.websocket_connect("/sync/pA") as ws:
            # The server sends the Yjs SyncStep1 to a new client on connect.
            assert isinstance(ws.receive_bytes(), (bytes, bytearray))


def test_unauthenticated_rejected(ctx):
    app, _db = ctx
    _seed_plan("d-1", "pA")
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/sync/pA"):
                pass


def test_unknown_plan_rejected(ctx):
    app, _db = ctx
    uid = _seed_plan("d-1", "pA")
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/sync/does-not-exist"):
                pass


def test_other_users_plan_rejected(ctx):
    app, _db = ctx
    _seed_plan("d-1", "pA")  # owned by d-1
    other = asyncio.run(users.upsert_user("d-2"))["id"]
    with TestClient(app) as client:
        client.get(f"/testlogin/{other}")
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/sync/pA"):
                pass


# --- 4.2 persistence & rehydration ----------------------------------------

def test_planystore_write_read_roundtrip(ctx):
    _app, _db = ctx
    store = sync.PlanYStore("pA")
    doc = Doc()
    doc.get("data", type=Map)["k"] = "v"
    asyncio.run(store.write(doc.get_update()))

    replay = Doc()
    asyncio.run(store.apply_updates(replay))  # BaseYStore.read() -> apply
    assert replay.get("data", type=Map)["k"] == "v"


def test_room_rehydrates_from_log_and_persists_new_updates(ctx):
    _app, db = ctx
    _seed_plan("d-1", "pA")
    seed = Doc()
    seed.get("data", type=Map)["x"] = 1
    asyncio.run(plans.append_update("pA", seed.get_update()))

    async def body():
        async with sync.sync_server:
            room = await sync.sync_server.get_room("pA")
            loaded = room.ydoc.get("data", type=Map)["x"]  # rehydrated from the log
            await room.ydoc_observed.wait()  # observer attaches once the room is ready
            room.ydoc.get("data", type=Map)["y"] = 2  # new edit -> persisted by ystore
            await asyncio.sleep(0.5)
            return loaded, await plans.count_updates("pA")

    loaded, count = asyncio.run(body())
    assert loaded == 1
    assert count >= 2  # the new update was appended

    # AD-5: persistence creates no finalized version — there is no versions table.
    tables = {r[0] for r in sqlite3.connect(db).execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert "versions" not in tables


# --- 4.3 squash ------------------------------------------------------------

def test_squash_reduces_rows_preserving_state(ctx):
    _app, _db = ctx
    doc = Doc()
    m = doc.get("data", type=Map)
    m["a"] = 1
    asyncio.run(plans.append_update("pA", doc.get_update()))
    m["b"] = 2
    asyncio.run(plans.append_update("pA", doc.get_update()))
    assert asyncio.run(plans.count_updates("pA")) == 2

    asyncio.run(sync.squash_plan("pA"))

    assert asyncio.run(plans.count_updates("pA")) == 1
    replay = Doc()
    replay.apply_update(asyncio.run(plans.load_updates("pA"))[0])
    rm = replay.get("data", type=Map)
    assert rm["a"] == 1 and rm["b"] == 2


def test_squash_is_noop_for_single_update(ctx):
    _app, _db = ctx
    doc = Doc()
    doc.get("data", type=Map)["a"] = 1
    asyncio.run(plans.append_update("pA", doc.get_update()))
    asyncio.run(sync.squash_plan("pA"))
    assert asyncio.run(plans.count_updates("pA")) == 1
