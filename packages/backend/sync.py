"""Flight-plan sync WebSocket (capability: plan-sync; AD-6, AD-14).

Served by FastAPI via `pycrdt-websocket` (AD-14): one Y.Doc per plan, the room
keyed by `planId`. The socket is authorized by the session cookie against the
plan's owning space. Updates are persisted to the `plan_updates` log (AD-13) and
the room's doc is rehydrated from that log on first open. Persistence creates no
finalized version (AD-5) — versioning is a later change.
"""
from contextlib import asynccontextmanager
from typing import AsyncIterator

from pycrdt import Doc
from pycrdt.store import BaseYStore
from pycrdt.websocket import WebsocketServer, YRoom
from pycrdt.websocket.websocket import HttpxWebsocket
from starlette.websockets import WebSocket

import plans
import spaces


class PlanYStore(BaseYStore):
    """A YStore backed by the `plan_updates` log for one plan (room)."""

    def __init__(self, plan_id: str, metadata_callback=None, log=None):
        self.plan_id = plan_id
        self.metadata_callback = metadata_callback
        self.log = log

    async def write(self, data: bytes) -> None:
        await plans.append_update(self.plan_id, data)

    async def read(self) -> AsyncIterator[tuple[bytes, bytes, float]]:
        for update in await plans.load_updates(self.plan_id):
            yield update, b"", 0.0


class PlanSyncServer(WebsocketServer):
    """A WebsocketServer whose rooms rehydrate from, and persist to, `plan_updates`.

    `auto_clean_rooms` is off so a room's doc survives the last client leaving;
    we squash the log at that point instead.
    """

    def __init__(self, **kwargs):
        kwargs.setdefault("auto_clean_rooms", False)
        super().__init__(**kwargs)

    async def get_room(self, name: str) -> YRoom:
        if name not in self.rooms:
            # Pre-load the doc from persisted updates BEFORE the room starts
            # observing, so the loaded state is not re-written to the store.
            ydoc = Doc()
            for update in await plans.load_updates(name):
                ydoc.apply_update(update)
            self.rooms[name] = YRoom(
                ready=self.rooms_ready,
                ydoc=ydoc,
                ystore=PlanYStore(name),
                exception_handler=self.exception_handler,
                log=self.log,
            )
        room = self.rooms[name]
        await self.start_room(room)
        return room


# Module-level singleton used by the FastAPI route; started in the app lifespan.
sync_server = PlanSyncServer()


@asynccontextmanager
async def lifespan_server():
    """Run the sync server for the app's lifetime."""
    async with sync_server:
        yield


async def _authorize(websocket: WebSocket, plan_id: str) -> bool:
    """A socket is allowed only if the session user is a member of the plan's
    owning space (AD-1). Anonymous callers and unknown/foreign plans are denied."""
    user_id = websocket.session.get("user_id")
    if not user_id:
        return False
    plan = await plans.get_plan(plan_id)
    if plan is None:
        return False
    return await spaces.user_in_space(plan["space_id"], user_id)


async def squash_plan(plan_id: str) -> None:
    """Collapse a plan's update log into a single full-state update (AD-5 note:
    persistence housekeeping, not a version)."""
    updates = await plans.load_updates(plan_id)
    if len(updates) <= 1:
        return
    doc = Doc()
    for update in updates:
        doc.apply_update(update)
    await plans.squash_updates(plan_id, doc.get_update())


async def serve_plan_socket(websocket: WebSocket, plan_id: str) -> None:
    """Authorize, then serve the Yjs sync protocol for one plan; squash the log
    when the last client leaves the room."""
    if not await _authorize(websocket, plan_id):
        await websocket.close(code=4403)  # policy violation (unauthorized room)
        return
    await websocket.accept()
    channel = HttpxWebsocket(websocket, plan_id)
    await sync_server.serve(channel)

    # Client disconnected — squash if the room is now empty.
    room = sync_server.rooms.get(plan_id)
    if room is not None and not room.clients:
        await squash_plan(plan_id)
