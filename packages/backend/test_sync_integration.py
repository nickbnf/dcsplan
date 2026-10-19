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
async def serving():
    """Start the real sync server behind a live (unauthenticated) /sync route."""
    server = sync.PlanSyncServer()

    @asynccontextmanager
    async def lifespan(_app):
        async with server:
            yield

    app = FastAPI(lifespan=lifespan)

    @app.websocket("/sync/{plan_id}")
    async def ws(websocket: WebSocket, plan_id: str):
        await websocket.accept()
        await server.serve(HttpxWebsocket(websocket, plan_id))
        room = server.rooms.get(plan_id)
        if room is not None and not room.clients:
            await sync.squash_plan(plan_id)

    config = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
    uv = uvicorn.Server(config)
    task = asyncio.create_task(uv.serve())
    while not uv.started:
        await asyncio.sleep(0.05)
    try:
        yield f"ws://127.0.0.1:{PORT}/sync"
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
