"""Finalized plan versions and pending editors (hand-written SQL, no ORM — AD-13).

A version is a restorable snapshot of a plan, coalesced to about one per editing
session (AD-5) and identified as `Rev N · date · editor`. It stores the plan's
full Yjs state and a pinned copy of the library entries and profile it
referenced (AD-3), so it never depends on the update log. Editors who have
touched a plan since its latest version wait in `plan_pending_editors` until the
next version consumes them (add-version-history D1, D4).

Deciding *when* to finalize, and reading the document, is `sync.finalize_plan`.
"""
import json
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from db import connect


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _version(row: aiosqlite.Row) -> dict:
    """A version row without its state or pinned snapshot."""
    return {
        "plan_id": row["plan_id"],
        "rev": row["rev"],
        "finalized_at": row["finalized_at"],
        "editors": json.loads(row["editors"]),
        "content_hash": row["content_hash"],
        "restored_from": row["restored_from"],
    }


_VERSION_COLUMNS = "plan_id, rev, finalized_at, editors, content_hash, restored_from"


async def latest_version(plan_id: str) -> Optional[dict]:
    """The plan's newest version, or None when it has none."""
    async with connect() as db:
        async with db.execute(
            f"SELECT {_VERSION_COLUMNS} FROM plan_versions WHERE plan_id = ? "
            "ORDER BY rev DESC LIMIT 1",
            (plan_id,),
        ) as cur:
            row = await cur.fetchone()
    return _version(row) if row else None


async def list_versions(plan_id: str) -> list[dict]:
    """The plan's versions, newest first."""
    async with connect() as db:
        async with db.execute(
            f"SELECT {_VERSION_COLUMNS} FROM plan_versions WHERE plan_id = ? ORDER BY rev DESC",
            (plan_id,),
        ) as cur:
            return [_version(r) for r in await cur.fetchall()]


async def get_version_state(plan_id: str, rev: int) -> Optional[bytes]:
    """The full Yjs state of one version, or None when there is no such version."""
    async with connect() as db:
        async with db.execute(
            "SELECT state FROM plan_versions WHERE plan_id = ? AND rev = ?", (plan_id, rev)
        ) as cur:
            row = await cur.fetchone()
    return bytes(row["state"]) if row else None


async def record_editor(plan_id: str, user_id: str) -> None:
    """Note that `user_id` edited the plan since its latest version (D4)."""
    async with connect() as db:
        await db.execute(
            "INSERT INTO plan_pending_editors (plan_id, user_id, last_edit_at) VALUES (?, ?, ?) "
            "ON CONFLICT (plan_id, user_id) DO UPDATE SET last_edit_at = excluded.last_edit_at",
            (plan_id, user_id, _now()),
        )


async def has_pending_editors(plan_id: str) -> bool:
    """Whether anyone has edited the plan since its latest version."""
    async with connect() as db:
        async with db.execute(
            "SELECT 1 FROM plan_pending_editors WHERE plan_id = ? LIMIT 1", (plan_id,)
        ) as cur:
            return await cur.fetchone() is not None


async def clear_pending_editors(plan_id: str, cutoff: str) -> None:
    """Forget the editors who edited at or before `cutoff`: a finalization found
    the content unchanged, so their edits came to nothing."""
    async with connect() as db:
        await db.execute(
            "DELETE FROM plan_pending_editors WHERE plan_id = ? AND last_edit_at <= ?",
            (plan_id, cutoff),
        )


async def idle_plans(idle_since: str) -> list[str]:
    """Live plans with pending editors, none of whom has edited after
    `idle_since`: their session has ended (AD-5)."""
    async with connect() as db:
        async with db.execute(
            "SELECT e.plan_id FROM plan_pending_editors e "
            "JOIN plans p ON p.id = e.plan_id AND p.deleted_at IS NULL "
            "GROUP BY e.plan_id HAVING MAX(e.last_edit_at) < ?",
            (idle_since,),
        ) as cur:
            return [r["plan_id"] for r in await cur.fetchall()]


async def _take_pending_editors(db: aiosqlite.Connection, plan_id: str, cutoff: str) -> list[str]:
    """Pending editors who edited at or before `cutoff`, last editor first;
    their rows are deleted. Later rows wait for the next version."""
    async with db.execute(
        "SELECT user_id FROM plan_pending_editors WHERE plan_id = ? AND last_edit_at <= ? "
        "ORDER BY last_edit_at DESC",
        (plan_id, cutoff),
    ) as cur:
        editors = [r["user_id"] for r in await cur.fetchall()]
    await db.execute(
        "DELETE FROM plan_pending_editors WHERE plan_id = ? AND last_edit_at <= ?",
        (plan_id, cutoff),
    )
    return editors


async def insert_version(
    plan_id: str,
    state: bytes,
    content_hash: str,
    pinned: dict,
    *,
    cutoff: str,
    actor: Optional[str] = None,
    restored_from: Optional[int] = None,
) -> dict:
    """Write the plan's next version, numbered in the same transaction.

    Its editors are the pending editors up to `cutoff` (the time the document
    was read), which are consumed. A restore is credited to `actor` alone. A
    version with no pending editor falls back to `actor`, then to the previous
    version's editors (D4)."""
    async with connect() as db:
        await db.execute("BEGIN IMMEDIATE")
        pending = await _take_pending_editors(db, plan_id, cutoff)
        async with db.execute(
            "SELECT rev, editors FROM plan_versions WHERE plan_id = ? ORDER BY rev DESC LIMIT 1",
            (plan_id,),
        ) as cur:
            previous = await cur.fetchone()
        if restored_from is not None and actor is not None:
            editors = [actor]
        elif pending:
            editors = pending
        elif actor is not None:
            editors = [actor]
        else:
            editors = json.loads(previous["editors"]) if previous else []
        version = {
            "plan_id": plan_id,
            "rev": (previous["rev"] if previous else 0) + 1,
            "finalized_at": _now(),
            "editors": editors,
            "content_hash": content_hash,
            "restored_from": restored_from,
        }
        await db.execute(
            "INSERT INTO plan_versions (plan_id, rev, finalized_at, editors, state, "
            "content_hash, pinned, restored_from) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                plan_id, version["rev"], version["finalized_at"], json.dumps(editors),
                state, content_hash, json.dumps(pinned), restored_from,
            ),
        )
    return version


async def pinned_entries(plan_id: str) -> dict[str, dict]:
    """For each library entry any version of the plan pinned, the copy held by
    the newest such version: `{entry_id: {"theatre", "data"}}` (D7)."""
    async with connect() as db:
        async with db.execute(
            "SELECT pinned FROM plan_versions WHERE plan_id = ? ORDER BY rev DESC", (plan_id,)
        ) as cur:
            rows = await cur.fetchall()
    result: dict[str, dict] = {}
    for row in rows:
        for entry_id, copy in json.loads(row["pinned"]).get("entries", {}).items():
            result.setdefault(entry_id, copy)
    return result


async def display_names(user_ids: list[str]) -> dict[str, Optional[str]]:
    """Current display names for `user_ids`, read when a version is shown."""
    if not user_ids:
        return {}
    marks = ", ".join("?" for _ in user_ids)
    async with connect() as db:
        async with db.execute(
            f"SELECT id, display_name FROM users WHERE id IN ({marks})", list(user_ids)
        ) as cur:
            return {r["id"]: r["display_name"] for r in await cur.fetchall()}
