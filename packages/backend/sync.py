"""Flight-plan sync WebSocket (capability: plan-sync; AD-6, AD-14).

Served by FastAPI via `pycrdt-websocket` (AD-14): one Y.Doc per plan, the room
keyed by `planId`. The socket is authorized by the session cookie against the
plan's owning space. Updates are persisted to the `plan_updates` log (AD-13) and
the room's doc is rehydrated from that log on first open. Persistence creates no
finalized version (AD-5) — versioning is a later change.

The plan's name lives only inside its document; on every persisted update the
store keeps the `plans` index in step (name on change, `updated_at` always), so
renames made offline reach the Flight Plans list on reconnect (unify-plan-name D2).
"""
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator, Optional

from pycrdt import Array, Doc, Map
from pycrdt.store import BaseYStore
from pycrdt.websocket import WebsocketServer, YRoom
from pycrdt.websocket.websocket import HttpxWebsocket
from starlette.websockets import WebSocket

import plans
import spaces


def doc_plan_name(ydoc: Doc) -> Optional[str]:
    """The plan name held in a flight-plan document (root map `flightPlan`)."""
    name = ydoc.get("flightPlan", type=Map).get("name")
    return name if isinstance(name, str) else None


class PlanYStore(BaseYStore):
    """A YStore backed by the `plan_updates` log for one plan (room).

    Given the room's `ydoc`, it also keeps the plan index in step with the
    document: `write` runs after the update has been applied to the server doc.
    """

    def __init__(self, plan_id: str, ydoc: Optional[Doc] = None, metadata_callback=None, log=None):
        self.plan_id = plan_id
        self.ydoc = ydoc
        self.metadata_callback = metadata_callback
        self.log = log
        self._last_name = doc_plan_name(ydoc) if ydoc is not None else None

    async def write(self, data: bytes) -> None:
        if not await plans.append_update(self.plan_id, data):
            return  # trashed meanwhile: nothing persisted, index untouched
        if self.ydoc is None:
            return
        name = doc_plan_name(self.ydoc)
        if name is not None and name != self._last_name:
            await plans.touch_plan(self.plan_id, name=name)
            self._last_name = name
        else:
            await plans.touch_plan(self.plan_id)

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
                ystore=PlanYStore(name, ydoc),
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


# Close codes the client acts on. 4403: not allowed (sent before accepting, so a
# browser only sees the handshake fail). 4410: the plan is trashed, sent after
# accepting so the browser receives the code and stops reconnecting
# (add-trash-and-soft-delete D4).
CLOSE_FORBIDDEN = 4403
CLOSE_GONE = 4410


async def _authorize(websocket: WebSocket, plan_id: str) -> Optional[int]:
    """None if the socket may sync the plan, else the close code. A socket is
    allowed only if the session user is a member of the plan's owning space
    (AD-1) and the plan is not trashed. Anonymous callers and unknown/foreign
    plans are forbidden; membership is checked first so a trashed plan's
    existence is not revealed to non-members."""
    if not plans.is_plan_id(plan_id):  # reject before any DB lookup (AD-16)
        return CLOSE_FORBIDDEN
    user_id = websocket.session.get("user_id")
    if not user_id:
        return CLOSE_FORBIDDEN
    plan = await plans.get_plan(plan_id)
    if plan is None or not await spaces.user_in_space(plan["space_id"], user_id):
        return CLOSE_FORBIDDEN
    return None if plans.is_live(plan) else CLOSE_GONE


async def close_plan_room(plan_id: str) -> None:
    """End sync for a trashed plan: close every connected socket with 4410 and
    drop the room, so nothing more is persisted (plan-sync)."""
    room = sync_server.rooms.get(plan_id)
    if room is None:
        return
    for client in list(room.clients):
        websocket = getattr(client, "_websocket", None)
        if websocket is not None:
            try:
                await websocket.close(code=CLOSE_GONE)
            except Exception:
                pass  # already closing
    if plan_id in sync_server.rooms:
        await sync_server.delete_room(name=plan_id)


@dataclass(frozen=True)
class PlanRefs:
    """What one plan's document references in its space (AD-7)."""
    plan_id: str
    profile_id: Optional[str]
    entry_ids: frozenset[str]


def doc_plan_refs(plan_id: str, ydoc: Doc) -> PlanRefs:
    """The profile and library entries a flight-plan document references:
    `flightPlan.profileId` and `flightPlan.libraryRefs[].uuid`."""
    y_plan = ydoc.get("flightPlan", type=Map)
    profile_id = y_plan.get("profileId")
    y_refs = y_plan.get("libraryRefs")
    entry_ids = set()
    if isinstance(y_refs, Array):
        for ref in y_refs:
            uuid = ref.get("uuid") if isinstance(ref, Map) else None
            if isinstance(uuid, str):
                entry_ids.add(uuid)
    return PlanRefs(
        plan_id=plan_id,
        profile_id=profile_id if isinstance(profile_id, str) else None,
        entry_ids=frozenset(entry_ids),
    )


async def plan_refs(space_id: str) -> list[PlanRefs]:
    """References held by every live plan in a space, read from the documents
    at call time (add-trash-and-soft-delete D3): an open room's doc when there
    is one, otherwise the replayed update log. Trashed plans are excluded.

    The single seam for reference lookups: a persistent index can replace this
    body without touching callers."""
    result = []
    for plan in await plans.list_plans(space_id):
        room = sync_server.rooms.get(plan["id"])
        if room is not None:
            ydoc = room.ydoc
        else:
            ydoc = Doc()
            for update in await plans.load_updates(plan["id"]):
                ydoc.apply_update(update)
        result.append(doc_plan_refs(plan["id"], ydoc))
    return result


async def count_profile_refs(space_id: str, profile_id: str) -> int:
    """How many live plans in the space fly `profile_id`."""
    return sum(1 for r in await plan_refs(space_id) if r.profile_id == profile_id)


async def count_entry_refs(space_id: str, entry_id: str) -> int:
    """How many live plans in the space reference library entry `entry_id`."""
    return sum(1 for r in await plan_refs(space_id) if entry_id in r.entry_ids)


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
    refusal = await _authorize(websocket, plan_id)
    if refusal == CLOSE_FORBIDDEN:
        await websocket.close(code=CLOSE_FORBIDDEN)  # policy violation (unauthorized room)
        return
    await websocket.accept()
    if refusal == CLOSE_GONE:
        await websocket.close(code=CLOSE_GONE)
        return
    channel = HttpxWebsocket(websocket, plan_id)
    await sync_server.serve(channel)

    # Client disconnected — squash if the room is now empty.
    room = sync_server.rooms.get(plan_id)
    if room is not None and not room.clients:
        await squash_plan(plan_id)
