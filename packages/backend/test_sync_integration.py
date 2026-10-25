"""End-to-end sync integration (tasks 11.1/11.2; spec: plan-sync).

Runs the real `PlanSyncServer` + `PlanYStore` behind a live FastAPI WebSocket
and drives it with two independent `pycrdt` clients over real sockets — the same
y-protocols a browser `y-websocket` client speaks. Authorization is covered by
test_sync.py; here the focus is convergence, merge, persistence and reconnect.
"""
import asyncio
from contextlib import asynccontextmanager

import pytest
import uvicorn
import websockets
from fastapi import FastAPI, WebSocket
from pycrdt import Doc, Map, Provider
from pycrdt.websocket.websocket import HttpxWebsocket

import sync
from migrations_runner import apply_migrations

PORT = 8799


class WsChannel:
    """Adapt a `websockets` client connection to pycrdt's Channel protocol."""

    def __init__(self, conn, path):
        self._c = conn
        self._path = path

    @property
    def path(self):
        return self._path

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return await self.recv()
        except Exception:
            raise StopAsyncIteration()

    async def send(self, message):
        await self._c.send(message)

    async def recv(self):
        m = await self._c.recv()
        return m if isinstance(m, bytes) else m.encode()


@asynccontextmanager
async def serving(with_server=False, user_id=None):
    """Start the real sync server behind a live (unauthenticated) /sync route.
    Yields the base URL, or `(base URL, server)` when `with_server` is set.
    With `user_id`, sockets record that user as an editor (add-version-history
    D4), as the authenticated route does."""
    server = sync.PlanSyncServer()

    @asynccontextmanager
    async def lifespan(_app):
        async with server:
            yield

    app = FastAPI(lifespan=lifespan)

    @app.websocket("/sync/{plan_id}")
    async def ws(websocket: WebSocket, plan_id: str):
        await websocket.accept()
        if user_id is None:
            await server.serve(HttpxWebsocket(websocket, plan_id))
        else:
            room = await server.get_room(plan_id)
            channel = sync.EditorTrackingChannel(websocket, plan_id, room.ydoc, user_id)
            await server.serve(channel)
            await channel.drain()
        room = server.rooms.get(plan_id)
        if room is not None and not room.clients:
            await sync.on_last_client_left(plan_id)

    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    uv = uvicorn.Server(config)
    task = asyncio.create_task(uv.serve())
    while not uv.started:
        await asyncio.sleep(0.05)
    try:
        base = f"ws://127.0.0.1:{PORT}/sync"
        yield (base, server) if with_server else base
    finally:
        uv.should_exit = True
        await task


@asynccontextmanager
async def client(base_url: str, room: str):
    doc = Doc()
    async with websockets.connect(f"{base_url}/{room}") as conn:
        async with Provider(doc, WsChannel(conn, room)):
            await asyncio.sleep(0.2)  # initial sync handshake
            yield doc


@pytest.fixture(autouse=True)
def db(tmp_path, monkeypatch):
    path = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", path)
    apply_migrations(path)


def test_concurrent_edits_to_different_fields_both_survive():
    async def scenario():
        async with serving() as base:
            async with client(base, "plan-1") as a, client(base, "plan-1") as b:
                a.get("fp", type=Map)["alt"] = 3000   # edit from A
                b.get("fp", type=Map)["tas"] = 420     # edit from B
                await asyncio.sleep(0.6)
                am, bm = a.get("fp", type=Map), b.get("fp", type=Map)
                return dict(am), dict(bm)

    a_state, b_state = asyncio.run(scenario())
    # Both edits converge on both clients.
    assert a_state == {"alt": 3000, "tas": 420}
    assert b_state == {"alt": 3000, "tas": 420}


def test_concurrent_edits_to_same_field_converge_without_corruption():
    async def scenario():
        async with serving() as base:
            async with client(base, "plan-2") as a, client(base, "plan-2") as b:
                a.get("fp", type=Map)["name"] = "Alpha"
                b.get("fp", type=Map)["name"] = "Bravo"
                await asyncio.sleep(0.6)
                return a.get("fp", type=Map)["name"], b.get("fp", type=Map)["name"]

    a_name, b_name = asyncio.run(scenario())
    # Deterministic convergence to one of the two values — no corruption, no split.
    assert a_name == b_name
    assert a_name in ("Alpha", "Bravo")


def test_edit_persists_and_rehydrates_for_a_later_client():
    async def scenario():
        async with serving() as base:
            async with client(base, "plan-3") as a:
                a.get("fp", type=Map)["route"] = "ingress"
                await asyncio.sleep(0.5)
            # A has disconnected (room squashed); a fresh client must still see it.
            await asyncio.sleep(0.2)
            async with client(base, "plan-3") as c:
                await asyncio.sleep(0.4)
                return c.get("fp", type=Map).get("route")

    assert asyncio.run(scenario()) == "ingress"


def test_reconnect_after_offline_edit_converges():
    async def scenario():
        async with serving() as base:
            # A edits, then disconnects (simulating going offline).
            async with client(base, "plan-4") as a:
                a.get("fp", type=Map)["a"] = 1
                await asyncio.sleep(0.4)
            # While A is away, B edits the same plan.
            async with client(base, "plan-4") as b:
                b.get("fp", type=Map)["b"] = 2
                await asyncio.sleep(0.4)
            # A reconnects — both edits are present after convergence.
            async with client(base, "plan-4") as a2:
                await asyncio.sleep(0.4)
                return dict(a2.get("fp", type=Map))

    assert asyncio.run(scenario()) == {"a": 1, "b": 2}


def test_plan_created_with_initial_state_syncs_its_content():
    """add-local-data-import D1: content stored at creation reaches a client."""
    import plans
    from db import connect

    async def scenario():
        async with connect() as c:
            await c.execute(
                "INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1', 'personal', NULL, 't')"
            )
        seeded = Doc()
        seeded["flightPlan"] = fp = Map()
        fp["name"] = "Imported"
        fp["initFob"] = 9000
        await plans.create_plan(
            "AAAAAAAAAAA1", "s1", "Imported", "caucasus", initial_update=seeded.get_update()
        )
        async with serving() as base:
            async with client(base, "AAAAAAAAAAA1") as a:
                return dict(a.get("flightPlan", type=Map))

    assert asyncio.run(scenario()) == {"name": "Imported", "initFob": 9000}


def test_update_applied_to_the_room_doc_is_persisted_and_broadcast():
    """add-version-history D5: a REST route merges a device's state by applying
    it to the open room's doc; that must reach other clients and the log, like
    an update received over a socket."""
    import plans
    from db import connect

    async def scenario():
        async with connect() as c:
            await c.execute(
                "INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1', 'personal', NULL, 't')"
            )
        await plans.create_plan("AAAAAAAAAAA2", "s1", "Plan", "caucasus")
        async with serving(with_server=True) as (base, server):
            async with client(base, "AAAAAAAAAAA2") as a:
                before = await plans.count_updates("AAAAAAAAAAA2")
                outside = Doc()
                outside["flightPlan"] = fp = Map()
                fp["name"] = "From REST"
                server.rooms["AAAAAAAAAAA2"].ydoc.apply_update(outside.get_update())
                await asyncio.sleep(0.4)
                after = await plans.count_updates("AAAAAAAAAAA2")
                return a.get("flightPlan", type=Map).get("name"), before, after

    name, before, after = asyncio.run(scenario())
    assert name == "From REST"
    assert after > before


# --- Editor attribution (add-version-history task 4.1, design D4) ------------

def _seed_plan(plan_id):
    import plans
    from db import connect

    async def go():
        async with connect() as c:
            await c.execute(
                "INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1', 'personal', NULL, 't')"
            )
            await c.execute("INSERT INTO users (id, discord_id, created_at) VALUES ('u1', 'd1', 't')")
        await plans.create_plan(plan_id, "s1", "Plan", "caucasus")

    return go()


def test_an_editing_socket_records_its_user():
    import versions

    async def scenario():
        await _seed_plan("AAAAAAAAAAA3")
        async with serving(user_id="u1") as base:
            async with client(base, "AAAAAAAAAAA3") as a:
                a.get("flightPlan", type=Map)["name"] = "Edited"
                await asyncio.sleep(0.4)
                return await versions.has_pending_editors("AAAAAAAAAAA3")

    assert asyncio.run(scenario()) is True


def test_a_reading_socket_records_nothing():
    import versions

    async def scenario():
        await _seed_plan("AAAAAAAAAAA4")
        async with serving(user_id="u1") as base:
            async with client(base, "AAAAAAAAAAA4"):
                await asyncio.sleep(0.4)
                return await versions.has_pending_editors("AAAAAAAAAAA4")

    assert asyncio.run(scenario()) is False


def test_a_reconnect_bringing_offline_edits_records_its_user():
    import versions

    async def scenario():
        await _seed_plan("AAAAAAAAAAA5")
        offline = Doc()
        offline.get("flightPlan", type=Map)["name"] = "Edited offline"
        async with serving(user_id="u1") as base:
            async with websockets.connect(f"{base}/AAAAAAAAAAA5") as conn:
                async with Provider(offline, WsChannel(conn, "AAAAAAAAAAA5")):
                    await asyncio.sleep(0.4)
                    return await versions.has_pending_editors("AAAAAAAAAAA5")

    assert asyncio.run(scenario()) is True


def test_last_client_leaving_finalizes_a_version():
    """add-version-history task 4.2 (spec: leaving the plan finalizes a version)."""
    import versions

    async def scenario():
        await _seed_plan("AAAAAAAAAAA6")
        async with serving(user_id="u1") as base:
            async with client(base, "AAAAAAAAAAA6") as a:
                a.get("flightPlan", type=Map)["name"] = "Edited"
                await asyncio.sleep(0.4)
            await asyncio.sleep(0.4)
            return await versions.list_versions("AAAAAAAAAAA6")

    [version] = asyncio.run(scenario())
    assert version["rev"] == 1
    assert version["editors"] == ["u1"]
