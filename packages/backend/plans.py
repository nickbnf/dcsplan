"""Plan index and plan-update log queries (hand-written SQL, no ORM — AD-13).

The `plans` table is the space's list of flight plans (name/theatre/metadata);
the actual plan content is a per-plan append-only log of Yjs updates in
`plan_updates` (AD-6, AD-14), periodically squashed (AD-5). A plan's `id` is
client-generated (draft -> committed, AD-15).

Unique names within a space (A1) are enforced by the `UNIQUE(space_id, name)`
constraint; a violation surfaces as `DuplicatePlanName`.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from db import connect


class DuplicatePlanName(Exception):
    """Raised when a plan name collides with another plan in the same space."""

    def __init__(self, name: str):
        super().__init__(f"A plan named {name!r} already exists in this space")
        self.name = name


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- Plan index -----------------------------------------------------------

async def create_plan(plan_id: str, space_id: str, name: str, theatre: str) -> dict:
    """Register a plan in a space (the defer-commit step). Raises
    DuplicatePlanName if the name is already used in that space."""
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
    except aiosqlite.IntegrityError as exc:
        if "plans.space_id, plans.name" in str(exc) or "UNIQUE" in str(exc).upper():
            raise DuplicatePlanName(name) from exc
        raise
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


async def rename_plan(plan_id: str, space_id: str, name: str) -> Optional[dict]:
    """Rename a plan that belongs to `space_id`. Returns the updated plan, or
    None if no such live plan exists in that space. Raises DuplicatePlanName on
    a name collision within the space."""
    async with connect() as db:
        async with db.execute(
            "SELECT 1 FROM plans WHERE id = ? AND space_id = ? AND deleted_at IS NULL",
            (plan_id, space_id),
        ) as cur:
            if await cur.fetchone() is None:
                return None
        try:
            await db.execute(
                "UPDATE plans SET name = ?, updated_at = ? WHERE id = ?",
                (name, _now(), plan_id),
            )
        except aiosqlite.IntegrityError as exc:
            if "plans.space_id, plans.name" in str(exc) or "UNIQUE" in str(exc).upper():
                raise DuplicatePlanName(name) from exc
            raise
        async with db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)) as cur:
            return dict(await cur.fetchone())


# --- Plan-update log (AD-14) ----------------------------------------------

async def append_update(plan_id: str, update_blob: bytes) -> None:
    """Append one Yjs update to a plan's log."""
    async with connect() as db:
        await db.execute(
            "INSERT INTO plan_updates (plan_id, update_blob, created_at) "
            "VALUES (?, ?, ?)",
            (plan_id, update_blob, _now()),
        )


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
