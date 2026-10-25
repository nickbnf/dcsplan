"""Flight-plan sync WebSocket (capability: plan-sync; AD-6, AD-14).

Served by FastAPI via `pycrdt-websocket` (AD-14): one Y.Doc per plan, the room
keyed by `planId`. The socket is authorized by the session cookie against the
plan's owning space. Updates are persisted to the `plan_updates` log (AD-13) and
the room's doc is rehydrated from that log on first open. Persistence creates no
finalized version (AD-5).

Versions (capability: version-history; add-version-history) are finalized here,
because finalizing reads the document from its room or its log:
`finalize_plan` runs when the last device leaves, from the inactivity sweep,
before a plan is trashed, and when a device asks (`version_routes`). Sockets
record their user as an editor when a message changes the plan's content.

The plan's name lives only inside its document; on every persisted update the
store keeps the `plans` index in step (name on change, `updated_at` always), so
renames made offline reach the Flight Plans list on reconnect (unify-plan-name D2).
"""
import asyncio
import hashlib
import json
import logging
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import AsyncIterator, Optional

from pycrdt import Array, Doc, Map, YMessageType, YSyncMessageType
from pycrdt.store import BaseYStore
from pycrdt.websocket import WebsocketServer, YRoom
from pycrdt.websocket.websocket import HttpxWebsocket
from starlette.websockets import WebSocket

import assets
import plans
import spaces
import versions

logger = logging.getLogger(__name__)


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


# --- Versions (add-version-history D2, D3) -----------------------------------

def content_hash(ydoc: Doc) -> str:
    """SHA-256 of the plan's `flightPlan` map as canonical JSON (D2). Compares
    content, not state vectors: a Yjs deletion leaves the state vector as is."""
    content = ydoc.get("flightPlan", type=Map).to_py()
    canonical = json.dumps(content, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


EMPTY_CONTENT_HASH = content_hash(Doc())


async def pin_dependencies(space_id: str, ydoc: Doc) -> dict:
    """The library entries and profile a plan references, as they stand now
    (AD-3). A reference that does not resolve to a live item is recorded as
    missing."""
    refs = doc_plan_refs("", ydoc)
    entries = await assets.live_entries(space_id, sorted(refs.entry_ids))
    profile = None
    if refs.profile_id is not None:
        data = await assets.live_profile(space_id, refs.profile_id)
        if data is not None:
            profile = {"id": refs.profile_id, "data": data}
    return {
        "entries": entries,
        "profile": profile,
        "missing": {
            "entries": sorted(refs.entry_ids - entries.keys()),
            "profile": refs.profile_id if refs.profile_id is not None and profile is None else None,
        },
    }


_finalize_locks: dict[str, asyncio.Lock] = {}


async def _plan_doc(plan_id: str) -> tuple[Doc, bool]:
    """The plan's document, and whether it is an open room's (live) doc."""
    room = sync_server.rooms.get(plan_id)
    if room is not None:
        return room.ydoc, True
    ydoc = Doc()
    for update in await plans.load_updates(plan_id):
        ydoc.apply_update(update)
    return ydoc, False


async def finalize_plan(
    plan_id: str,
    update: Optional[bytes] = None,
    restored_from: Optional[int] = None,
    actor: Optional[str] = None,
) -> Optional[dict]:
    """Finalize the plan's unfinalized edits into a version (D3) and return the
    plan's latest version, or None for a plan that is not live or has neither
    a version nor content.

    `update`, a device's document state, is merged first, through the open room
    when there is one so it is persisted and broadcast like a socket update
    (D5). A restore (`restored_from`) always writes a version."""
    lock = _finalize_locks.setdefault(plan_id, asyncio.Lock())
    async with lock:
        plan = await plans.get_plan(plan_id)
        if not plans.is_live(plan):
            return None
        ydoc, live = await _plan_doc(plan_id)
        if update is not None:
            before = content_hash(ydoc)
            ydoc.apply_update(update)
            if not live:
                await plans.append_update(plan_id, update)
            if actor is not None and content_hash(ydoc) != before:
                await versions.record_editor(plan_id, actor)
        cutoff = datetime.now(timezone.utc).isoformat()
        digest = content_hash(ydoc)
        latest = await versions.latest_version(plan_id)
        if restored_from is None:
            unchanged = (
                latest["content_hash"] == digest if latest is not None
                else digest == EMPTY_CONTENT_HASH
            )
            if unchanged:
                await versions.clear_pending_editors(plan_id, cutoff)
                return latest
        pinned = await pin_dependencies(plan["space_id"], ydoc)
        return await versions.insert_version(
            plan_id, ydoc.get_update(), digest, pinned,
            cutoff=cutoff, actor=actor, restored_from=restored_from,
        )


def _may_edit(message: bytes) -> bool:
    """Whether a received message carries document content: sync step 2 (a
    connecting device's missing updates, its offline edits included) or an
    update. A step 2 always holds the sender's whole delete set, so it can be
    non-empty without changing anything."""
    return (
        len(message) >= 2
        and message[0] == YMessageType.SYNC
        and message[1] in (YSyncMessageType.SYNC_STEP2, YSyncMessageType.SYNC_UPDATE)
    )


class EditorTrackingChannel(HttpxWebsocket):
    """A plan socket that records its user as an editor of the plan whenever a
    message it receives changes the plan's content (add-version-history D4).

    The room applies a sync message synchronously once `recv` returns it, so a
    callback scheduled at receive time sees the document after the change."""

    def __init__(self, websocket, plan_id: str, ydoc: Doc, user_id: str):
        super().__init__(websocket, plan_id)
        self._ydoc = ydoc
        self._user_id = user_id
        self._pending: set[asyncio.Task] = set()

    async def recv(self) -> bytes:
        message = await super().recv()
        if _may_edit(message):
            before = content_hash(self._ydoc)
            asyncio.get_running_loop().call_soon(self._check, before)
        return message

    def _check(self, before: str) -> None:
        if content_hash(self._ydoc) == before:
            return
        task = asyncio.ensure_future(versions.record_editor(self.path, self._user_id))
        self._pending.add(task)
        task.add_done_callback(self._pending.discard)

    async def drain(self) -> None:
        """Wait until every edit noticed so far has been recorded."""
        await asyncio.sleep(0)  # let a check scheduled by the last message run
        if self._pending:
            await asyncio.gather(*self._pending)


async def has_unfinalized_edits(plan_id: str) -> bool:
    """Whether the plan's content differs from its latest version (D2); for a
    plan with no version, whether it has any content."""
    ydoc, _ = await _plan_doc(plan_id)
    digest = content_hash(ydoc)
    latest = await versions.latest_version(plan_id)
    if latest is None:
        return digest != EMPTY_CONTENT_HASH
    return digest != latest["content_hash"]


SESSION_IDLE_SECONDS = 10 * 60
SWEEP_INTERVAL_SECONDS = 60


async def finalize_idle_plans(now: Optional[datetime] = None) -> int:
    """Finalize every plan whose editing session has ended: no edit for
    SESSION_IDLE_SECONDS (AD-5). Returns the number of plans finalized."""
    idle_since = ((now or datetime.now(timezone.utc)) - timedelta(seconds=SESSION_IDLE_SECONDS)).isoformat()
    plan_ids = await versions.idle_plans(idle_since)
    for plan_id in plan_ids:
        await finalize_plan(plan_id)
    return len(plan_ids)


async def run_sweep_forever(interval: float = SWEEP_INTERVAL_SECONDS) -> None:
    """Finalize idle plans every `interval` seconds, until cancelled. Sweeping
    rather than timing each room survives a restart: a session interrupted by
    one is finalized by the next run (add-version-history D3)."""
    while True:
        try:
            await finalize_idle_plans()
        except Exception:
            logger.exception("Version sweep failed")
        await asyncio.sleep(interval)


@asynccontextmanager
async def lifespan_sweep(interval: float = SWEEP_INTERVAL_SECONDS):
    """Run the inactivity sweep for the app's lifetime; cancelled on shutdown."""
    task = asyncio.create_task(run_sweep_forever(interval))
    try:
        yield task
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


async def serve_plan_socket(websocket: WebSocket, plan_id: str) -> None:
    """Authorize, then serve the Yjs sync protocol for one plan; when the last
    client leaves the room, finalize a version and squash the log."""
    refusal = await _authorize(websocket, plan_id)
    if refusal == CLOSE_FORBIDDEN:
        await websocket.close(code=CLOSE_FORBIDDEN)  # policy violation (unauthorized room)
        return
    await websocket.accept()
    if refusal == CLOSE_GONE:
        await websocket.close(code=CLOSE_GONE)
        return
    room = await sync_server.get_room(plan_id)
    channel = EditorTrackingChannel(websocket, plan_id, room.ydoc, websocket.session["user_id"])
    await sync_server.serve(channel)
    await channel.drain()

    # Client disconnected — if the room is now empty, the session is over.
    room = sync_server.rooms.get(plan_id)
    if room is not None and not room.clients:
        await on_last_client_left(plan_id)


async def on_last_client_left(plan_id: str) -> None:
    """The last device left the plan: finalize the session into a version (AD-5)
    without waiting for the inactivity sweep, then squash the update log."""
    await finalize_plan(plan_id)
    await squash_plan(plan_id)
