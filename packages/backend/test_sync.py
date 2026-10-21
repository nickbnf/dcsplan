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

PA = "AAAAAAAAAAA1"  # a well-formed 12-char base58 plan id


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
    uid = _seed_plan("d-1", PA)
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with client.websocket_connect(f"/sync/{PA}") as ws:
            # The server sends the Yjs SyncStep1 to a new client on connect.
            assert isinstance(ws.receive_bytes(), (bytes, bytearray))


def test_unauthenticated_rejected(ctx):
    app, _db = ctx
    _seed_plan("d-1", PA)
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/sync/{PA}"):
                pass


def test_unknown_plan_rejected(ctx):
    app, _db = ctx
    uid = _seed_plan("d-1", PA)
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/sync/AAAAAAAAAAA9"):
                pass


def test_other_users_plan_rejected(ctx):
    app, _db = ctx
    _seed_plan("d-1", PA)  # owned by d-1
    other = asyncio.run(users.upsert_user("d-2"))["id"]
    with TestClient(app) as client:
        client.get(f"/testlogin/{other}")
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect(f"/sync/{PA}"):
                pass


def test_malformed_plan_id_rejected_before_db_lookup(ctx, monkeypatch):
    app, _db = ctx
    uid = _seed_plan("d-1", PA)

    async def boom(_plan_id):
        raise AssertionError("get_plan must not be called for a malformed id")

    monkeypatch.setattr(plans, "get_plan", boom)
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/sync/not-a-plan-id"):
                pass


# --- 4.2 persistence & rehydration ----------------------------------------

def test_planystore_write_read_roundtrip(ctx):
    _app, _db = ctx
    _seed_plan("d-1", PA)  # updates are only accepted for a live plan
    store = sync.PlanYStore(PA)
    doc = Doc()
    doc.get("data", type=Map)["k"] = "v"
    asyncio.run(store.write(doc.get_update()))

    replay = Doc()
    asyncio.run(store.apply_updates(replay))  # BaseYStore.read() -> apply
    assert replay.get("data", type=Map)["k"] == "v"


def test_room_rehydrates_from_log_and_persists_new_updates(ctx):
    _app, db = ctx
    _seed_plan("d-1", PA)
    seed = Doc()
    seed.get("data", type=Map)["x"] = 1
    asyncio.run(plans.append_update(PA, seed.get_update()))

    async def body():
        async with sync.sync_server:
            room = await sync.sync_server.get_room(PA)
            loaded = room.ydoc.get("data", type=Map)["x"]  # rehydrated from the log
            await room.ydoc_observed.wait()  # observer attaches once the room is ready
            room.ydoc.get("data", type=Map)["y"] = 2  # new edit -> persisted by ystore
            await asyncio.sleep(0.5)
            return loaded, await plans.count_updates(PA)

    loaded, count = asyncio.run(body())
    assert loaded == 1
    assert count >= 2  # the new update was appended

    # AD-5: persistence creates no finalized version — there is no versions table.
    tables = {r[0] for r in sqlite3.connect(db).execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    )}
    assert "versions" not in tables


# --- unify-plan-name D2: the index follows the document ------------------

def _room_edit(server, plan_id, mutate):
    """Open the plan's room, apply `mutate(flightPlan_map)` to the server doc, and
    return the plan row once the store has persisted the update."""
    async def body():
        async with server:
            room = await server.get_room(plan_id)
            await room.ydoc_observed.wait()
            mutate(room.ydoc.get("flightPlan", type=Map))
            await asyncio.sleep(0.4)
            return await plans.get_plan(plan_id)
    return asyncio.run(body())


def test_rename_in_document_updates_index_name(ctx):
    _app, _db = ctx
    _seed_plan("d-1", PA)  # index name "Alpha"
    row = _room_edit(sync.sync_server, PA, lambda m: m.__setitem__("name", "Renamed"))
    assert row["name"] == "Renamed"


def test_non_name_edit_bumps_updated_at_only(ctx):
    _app, _db = ctx
    _seed_plan("d-1", PA)
    before = asyncio.run(plans.get_plan(PA))
    row = _room_edit(sync.sync_server, PA, lambda m: m.__setitem__("bankAngle", 30))
    assert row["name"] == "Alpha"
    assert row["updated_at"] > before["updated_at"]


def test_offline_rename_updates_index_when_it_reaches_the_server(ctx):
    _app, _db = ctx
    _seed_plan("d-1", PA)
    # Server already holds the document with its original name.
    base = Doc()
    base.get("flightPlan", type=Map)["name"] = "Alpha"
    asyncio.run(plans.append_update(PA, base.get_update()))

    # A client, offline, renames its copy; the diff reaches the server later.
    client_doc = Doc()
    client_doc.apply_update(base.get_update())
    state_before = client_doc.get_state()
    client_doc.get("flightPlan", type=Map)["name"] = "Renamed Offline"
    offline_update = client_doc.get_update(state_before)

    async def deliver():
        async with sync.sync_server:
            room = await sync.sync_server.get_room(PA)
            await room.ydoc_observed.wait()
            before = (await plans.get_plan(PA))["name"]
            room.ydoc.apply_update(offline_update)  # the client reconnects
            await asyncio.sleep(0.4)
            return before, (await plans.get_plan(PA))["name"]

    before, after = asyncio.run(deliver())
    assert before == "Alpha"
    assert after == "Renamed Offline"


# --- 4.3 squash ------------------------------------------------------------

def test_squash_reduces_rows_preserving_state(ctx):
    _app, _db = ctx
    _seed_plan("d-1", PA)  # updates are only accepted for a live plan
    doc = Doc()
    m = doc.get("data", type=Map)
    m["a"] = 1
    asyncio.run(plans.append_update(PA, doc.get_update()))
    m["b"] = 2
    asyncio.run(plans.append_update(PA, doc.get_update()))
    assert asyncio.run(plans.count_updates(PA)) == 2

    asyncio.run(sync.squash_plan(PA))

    assert asyncio.run(plans.count_updates(PA)) == 1
    replay = Doc()
    replay.apply_update(asyncio.run(plans.load_updates(PA))[0])
    rm = replay.get("data", type=Map)
    assert rm["a"] == 1 and rm["b"] == 2


def test_squash_is_noop_for_single_update(ctx):
    _app, _db = ctx
    _seed_plan("d-1", PA)  # updates are only accepted for a live plan
    doc = Doc()
    doc.get("data", type=Map)["a"] = 1
    asyncio.run(plans.append_update(PA, doc.get_update()))
    asyncio.run(sync.squash_plan(PA))
    assert asyncio.run(plans.count_updates(PA)) == 1


# --- add-trash-and-soft-delete 4.1/4.2: trashed plans stop syncing -------------

def _receive_until_closed(ws) -> int:
    """Drain server messages until the server closes; return the close code."""
    while True:
        try:
            ws.receive_bytes()
        except WebSocketDisconnect as exc:
            return exc.code


def test_trashed_plan_refused_with_4410(ctx):
    app, _db = ctx
    uid = _seed_plan("d-1", PA)
    asyncio.run(plans.trash_plan(PA))
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with client.websocket_connect(f"/sync/{PA}") as ws:
            assert _receive_until_closed(ws) == sync.CLOSE_GONE


def test_trashed_plan_of_another_user_is_forbidden_not_gone(ctx):
    app, _db = ctx
    _seed_plan("d-1", PA)
    asyncio.run(plans.trash_plan(PA))
    other = asyncio.run(users.upsert_user("d-2"))["id"]
    with TestClient(app) as client:
        client.get(f"/testlogin/{other}")
        with pytest.raises(WebSocketDisconnect) as exc:
            with client.websocket_connect(f"/sync/{PA}"):
                pass
        assert exc.value.code == sync.CLOSE_FORBIDDEN


def test_deleting_an_open_plan_closes_its_sockets(ctx):
    import space_routes

    app, _db = ctx
    uid = _seed_plan("d-1", PA)
    app.include_router(space_routes.router)
    app.dependency_overrides[space_routes.require_user] = lambda: {"id": uid}
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with client.websocket_connect(f"/sync/{PA}") as ws:
            ws.receive_bytes()  # SyncStep1: the socket is in the room
            assert client.delete(f"/plans/{PA}").status_code == 204
            assert _receive_until_closed(ws) == sync.CLOSE_GONE
        assert PA not in sync.sync_server.rooms
        with client.websocket_connect(f"/sync/{PA}") as ws:  # reconnect refused
            assert _receive_until_closed(ws) == sync.CLOSE_GONE

    before = asyncio.run(plans.count_updates(PA))
    doc = Doc()
    doc.get("flightPlan", type=Map)["name"] = "late edit"
    asyncio.run(sync.PlanYStore(PA, doc).write(doc.get_update()))
    assert asyncio.run(plans.count_updates(PA)) == before


def test_close_plan_room_without_room_is_noop(ctx):
    asyncio.run(sync.close_plan_room(PA))


def test_restored_plan_syncs_again(ctx):
    app, _db = ctx
    uid = _seed_plan("d-1", PA)
    asyncio.run(plans.trash_plan(PA))
    asyncio.run(plans.restore_plan(PA))
    with TestClient(app) as client:
        client.get(f"/testlogin/{uid}")
        with client.websocket_connect(f"/sync/{PA}") as ws:
            # Accepted and served: the server sends SyncStep1, not a 4410 close.
            assert isinstance(ws.receive_bytes(), (bytes, bytearray))
