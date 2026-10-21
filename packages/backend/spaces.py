"""Space and membership queries (hand-written SQL, no ORM — AD-13).

A space is the unit of ownership (AD-1). Ownership is modelled as membership for
every space kind, so squadrons are additive later (see AD-1's ownership note): a
Personal space is a `spaces` row plus one `space_members` row with role 'owner'.

`get_or_create_personal_space` is the single writer of Personal spaces — the one
place where "exactly one Personal space per user" (AD-1) is enforced, because the
condition spans `spaces` and `space_members` and cannot be a DB constraint.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from db import connect


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_dict(row: Optional[aiosqlite.Row]) -> Optional[dict]:
    return dict(row) if row is not None else None


async def get_personal_space(user_id: str) -> Optional[dict]:
    """The user's Personal space, or None if it has not been materialized yet."""
    async with connect() as db:
        async with db.execute(
            "SELECT s.* FROM spaces s "
            "JOIN space_members m ON m.space_id = s.id "
            "WHERE m.user_id = ? AND s.kind = 'personal'",
            (user_id,),
        ) as cur:
            return _to_dict(await cur.fetchone())


async def get_or_create_personal_space(user_id: str) -> dict:
    """Return the user's Personal space, creating it (with the user as sole owner
    member) on first access. Idempotent: a later call returns the same space and
    never creates a second Personal space for the user (AD-1)."""
    async with connect() as db:
        async with db.execute(
            "SELECT s.* FROM spaces s "
            "JOIN space_members m ON m.space_id = s.id "
            "WHERE m.user_id = ? AND s.kind = 'personal'",
            (user_id,),
        ) as cur:
            existing = await cur.fetchone()
        if existing is not None:
            return _to_dict(existing)

        space = {
            "id": uuid.uuid4().hex,
            "kind": "personal",
            "name": None,
            "created_at": _now(),
        }
        await db.execute(
            "INSERT INTO spaces (id, kind, name, created_at) "
            "VALUES (:id, :kind, :name, :created_at)",
            space,
        )
        await db.execute(
            "INSERT INTO space_members (space_id, user_id, role, joined_at) "
            "VALUES (?, ?, 'owner', ?)",
            (space["id"], user_id, _now()),
        )
        return space


async def get_member_role(space_id: str, user_id: str) -> Optional[str]:
    """The user's role in the space, or None if they are not a member."""
    async with connect() as db:
        async with db.execute(
            "SELECT role FROM space_members WHERE space_id = ? AND user_id = ?",
            (space_id, user_id),
        ) as cur:
            row = await cur.fetchone()
            return row["role"] if row is not None else None


async def user_in_space(space_id: str, user_id: str) -> bool:
    """Whether the user is a member of the space (authorization helper)."""
    return (await get_member_role(space_id, user_id)) is not None


# Roles allowed to restore from the space's Trash (AD-7: any member may delete,
# the admin restores). A Personal space's sole member is its owner.
RESTORE_ROLES = frozenset({"owner", "admin"})


def can_restore(role: Optional[str]) -> bool:
    """Whether a member with `role` may restore trashed items."""
    return role in RESTORE_ROLES
