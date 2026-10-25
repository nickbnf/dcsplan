"""Plan index and plan-update log queries (hand-written SQL, no ORM — AD-13).

The `plans` table is the space's list of flight plans (name/theatre/metadata);
the actual plan content is a per-plan append-only log of Yjs updates in
`plan_updates` (AD-6, AD-14), periodically squashed (AD-5). A plan's `id` is
client-generated (draft -> committed, AD-15): 12 base58 characters (AD-16).

Plan names need not be unique (unify-plan-name); `plans.name` is a
server-maintained copy of the name inside the plan's document.
"""
import re
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from db import connect


# 12 characters from the base58 alphabet (no 0, O, I, l) — AD-16.
PLAN_ID_PATTERN = r"^[1-9A-HJ-NP-Za-km-z]{12}$"
_PLAN_ID_RE = re.compile(PLAN_ID_PATTERN)


def is_plan_id(value: str) -> bool:
    """Whether `value` is a well-formed plan id."""
    return bool(_PLAN_ID_RE.match(value))


class DuplicatePlanId(Exception):
    """Raised when a plan id is already taken (a ~70-bit collision: not retried)."""

    def __init__(self, plan_id: str):
        super().__init__(f"A plan with id {plan_id!r} already exists")
        self.plan_id = plan_id


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Plan index -----------------------------------------------------------

async def create_plan(
    plan_id: str,
    space_id: str,
    name: str,
    theatre: str,
    initial_update: Optional[bytes] = None,
) -> dict:
    """Register a plan in a space (the defer-commit step). Raises
    DuplicatePlanId if the id is already taken.

    `initial_update`, when given, becomes the plan's first Yjs update in the
    same transaction, so the plan is never listed without its content
    (add-local-data-import D1)."""
    plan = {
        "id": plan_id,
        "space_id": space_id,
        "name": name,
        "theatre": theatre,
        "created_at": _now(),
        "updated_at": _now(),
        "deleted_at": None,
    }
    try:
        async with connect() as db:
            await db.execute(
                "INSERT INTO plans "
                "(id, space_id, name, theatre, created_at, updated_at, deleted_at) "
                "VALUES (:id, :space_id, :name, :theatre, :created_at, :updated_at, :deleted_at)",
                plan,
            )
            if initial_update is not None:
                await db.execute(
                    "INSERT INTO plan_updates (plan_id, update_blob, created_at) "
                    "VALUES (?, ?, ?)",
                    (plan_id, initial_update, plan["created_at"]),
                )
    except aiosqlite.IntegrityError as exc:
        raise DuplicatePlanId(plan_id) from exc
    return plan


async def list_plans(space_id: str) -> list[dict]:
    """Plans in a space, newest-updated first, excluding soft-deleted rows."""
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM plans WHERE space_id = ? AND deleted_at IS NULL "
            "ORDER BY updated_at DESC",
            (space_id,),
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def get_plan(plan_id: str) -> Optional[dict]:
    """A plan by id (including which space owns it, for authorization)."""
    async with connect() as db:
        async with db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)) as cur:
            row = await cur.fetchone()
            return dict(row) if row is not None else None



async def trash_plan(plan_id: str) -> bool:
    """Move a plan to its space's Trash (soft-delete, AD-7). Returns False if the
    plan is unknown or already trashed; the first `deleted_at` is kept."""
    async with connect() as db:
        cur = await db.execute(
            "UPDATE plans SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL",
            (_now(), plan_id),
        )
        return cur.rowcount == 1


async def restore_plan(plan_id: str) -> bool:
    """Bring a trashed (not purged) plan back to its space's list, with the
    content it had when deleted. Returns False if there is nothing to restore."""
    async with connect() as db:
        cur = await db.execute(
            "UPDATE plans SET deleted_at = NULL "
            "WHERE id = ? AND deleted_at IS NOT NULL AND purged_at IS NULL",
            (plan_id,),
        )
        return cur.rowcount == 1


async def trashed_plans(space_id: str) -> list[dict]:
    """The space's trashed, not yet purged, plans."""
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM plans WHERE space_id = ? "
            "AND deleted_at IS NOT NULL AND purged_at IS NULL",
            (space_id,),
        ) as cur:
            return [dict(r) for r in await cur.fetchall()]


async def purge_plans(cutoff: str) -> list[str]:
    """Purge plans trashed before `cutoff` (an ISO timestamp): their update log,
    versions and pending editors are deleted and `purged_at` set
    (add-version-history D1). The row is kept so the id is never reused.
    Returns the purged ids."""
    async with connect() as db:
        await db.execute("BEGIN IMMEDIATE")
        async with db.execute(
            "SELECT id FROM plans "
            "WHERE deleted_at IS NOT NULL AND purged_at IS NULL AND deleted_at < ?",
            (cutoff,),
        ) as cur:
            ids = [r["id"] for r in await cur.fetchall()]
        now = _now()
        for plan_id in ids:
            await db.execute("DELETE FROM plan_updates WHERE plan_id = ?", (plan_id,))
            await db.execute("DELETE FROM plan_versions WHERE plan_id = ?", (plan_id,))
            await db.execute("DELETE FROM plan_pending_editors WHERE plan_id = ?", (plan_id,))
            await db.execute("UPDATE plans SET purged_at = ? WHERE id = ?", (now, plan_id))
        return ids


def is_live(plan: Optional[dict]) -> bool:
    """Whether a plan row exists and is neither trashed nor purged."""
    return plan is not None and plan["deleted_at"] is None


async def touch_plan(plan_id: str, name: Optional[str] = None) -> None:
    """Refresh a plan's `updated_at`, and its index `name` when given — the
    server-maintained copy of the document's name (unify-plan-name D2)."""
    async with connect() as db:
        if name is None:
            await db.execute("UPDATE plans SET updated_at = ? WHERE id = ?", (_now(), plan_id))
        else:
            await db.execute(
                "UPDATE plans SET name = ?, updated_at = ? WHERE id = ?",
                (name, _now(), plan_id),
            )


# --- Plan-update log (AD-14) ----------------------------------------------

async def append_update(plan_id: str, update_blob: bytes) -> bool:
    """Append one Yjs update to a plan's log. A trashed plan accepts no update
    (plan-sync): the update is dropped and False returned."""
    async with connect() as db:
        cur = await db.execute(
            "INSERT INTO plan_updates (plan_id, update_blob, created_at) "
            "SELECT ?, ?, ? WHERE EXISTS "
            "(SELECT 1 FROM plans WHERE id = ? AND deleted_at IS NULL)",
            (plan_id, update_blob, _now(), plan_id),
        )
        return cur.rowcount == 1


async def load_updates(plan_id: str) -> list[bytes]:
    """A plan's Yjs updates, in insertion order."""
    async with connect() as db:
        async with db.execute(
            "SELECT update_blob FROM plan_updates WHERE plan_id = ? ORDER BY seq",
            (plan_id,),
        ) as cur:
            return [bytes(r["update_blob"]) for r in await cur.fetchall()]


async def count_updates(plan_id: str) -> int:
    """Number of update rows held for a plan."""
    async with connect() as db:
        async with db.execute(
            "SELECT COUNT(*) AS n FROM plan_updates WHERE plan_id = ?", (plan_id,)
        ) as cur:
            return (await cur.fetchone())["n"]


async def squash_updates(plan_id: str, squashed_blob: bytes) -> None:
    """Replace all of a plan's update rows with a single squashed update,
    atomically. The caller computes the merged state (persistence housekeeping,
    not versioning — AD-5)."""
    async with connect() as db:
        await db.execute("DELETE FROM plan_updates WHERE plan_id = ?", (plan_id,))
        await db.execute(
            "INSERT INTO plan_updates (plan_id, update_blob, created_at) "
            "VALUES (?, ?, ?)",
            (plan_id, squashed_blob, _now()),
        )
