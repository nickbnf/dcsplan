"""Space-owned theatre libraries and performance profiles (hand-written SQL, no
ORM — AD-13). Capability: space-asset-sync; AD-6 (LWW), AD-17 (library as a
container).

Every write takes the next value of the shared `asset_seq` counter inside its
own transaction, so `seq` order is commit order and a client can pull "all rows
with seq > cursor" (the change feed). Rows are last-write-wins as a whole; a
delete leaves a tombstone so a stale offline device cannot bring it back. A
tombstone that still holds its data is in the Trash; purging nulls the data
(add-trash-and-soft-delete D1).

Write rules (design D3), by the row's state on the server and `base_seq`
(None = the client believes it is creating the row):

    no row     -> applied
    live       -> edit applied (LWW); create IGNORED, current row returned
    tombstone  -> edit IGNORED, tombstone returned; create revives the row

Payloads are validated by the routes; this module stores them as JSON text.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from db import connect


class UnknownLibrary(Exception):
    """The library id does not exist in the given space."""


class LibraryMismatch(Exception):
    """A write names a different library from the one the entry is stored in."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _begin(db: aiosqlite.Connection) -> None:
    # IMMEDIATE takes the write lock up front: seq allocation and the row write
    # commit together, so seq order matches commit order.
    await db.execute("BEGIN IMMEDIATE")


async def _next_seq(db: aiosqlite.Connection) -> int:
    async with db.execute("UPDATE asset_seq SET n = n + 1 RETURNING n") as cur:
        row = await cur.fetchone()
    return row[0]


# --- Libraries ---------------------------------------------------------------

def _public_library(row: aiosqlite.Row) -> dict:
    return {
        "id": row["id"],
        "theatre": row["theatre"],
        "name": row["name"],
        "parentId": row["parent_id"],
        "seq": row["seq"],
    }


async def libraries_for_theatre(space_id: str, theatre: str) -> list[dict]:
    """The space's libraries for a theatre, creating the default one on first
    access. A list because AD-17 anticipates several; exactly one today."""
    async with connect() as db:
        await _begin(db)
        async with db.execute(
            "SELECT * FROM libraries WHERE space_id = ? AND theatre = ? ORDER BY created_at",
            (space_id, theatre),
        ) as cur:
            rows = await cur.fetchall()
        if rows:
            return [_public_library(r) for r in rows]
        seq = await _next_seq(db)
        lib_id = uuid.uuid4().hex
        await db.execute(
            "INSERT INTO libraries (id, space_id, theatre, name, parent_id, seq, created_at) "
            "VALUES (?, ?, ?, NULL, NULL, ?, ?)",
            (lib_id, space_id, theatre, seq, _now()),
        )
        async with db.execute("SELECT * FROM libraries WHERE id = ?", (lib_id,)) as cur:
            return [_public_library(await cur.fetchone())]


async def _require_library(db: aiosqlite.Connection, space_id: str, library_id: str) -> None:
    async with db.execute(
        "SELECT 1 FROM libraries WHERE id = ? AND space_id = ?", (library_id, space_id)
    ) as cur:
        if await cur.fetchone() is None:
            raise UnknownLibrary(library_id)


# --- Rows (entries and profiles) ---------------------------------------------

def _decode(data: Optional[str]) -> Optional[dict]:
    return json.loads(data) if data is not None else None


def _live_data(row: aiosqlite.Row) -> Optional[dict]:
    """A row's payload, or None for any tombstone: trashed content is never
    sent with the row (add-trash-and-soft-delete D2)."""
    return _decode(row["data"]) if row["deleted_at"] is None else None


def _is_trashed(row: aiosqlite.Row) -> bool:
    """A tombstone that still holds its data is in the Trash (D1)."""
    return row["deleted_at"] is not None and row["data"] is not None


def _public_entry(row: aiosqlite.Row) -> dict:
    data = _live_data(row)
    return {
        "id": row["id"],
        "libraryId": row["library_id"],
        "seq": row["seq"],
        "deleted": row["deleted_at"] is not None,
        "trashed": _is_trashed(row),
        "entry": {"id": row["id"], **data} if data is not None else None,
    }


def _public_profile(row: aiosqlite.Row) -> dict:
    data = _live_data(row)
    return {
        "id": row["id"],
        "seq": row["seq"],
        "deleted": row["deleted_at"] is not None,
        "trashed": _is_trashed(row),
        "profile": {"id": row["id"], **data} if data is not None else None,
    }


async def _fetch_row(db, table: str, space_id: str, row_id: str) -> Optional[aiosqlite.Row]:
    async with db.execute(
        f"SELECT * FROM {table} WHERE space_id = ? AND id = ?", (space_id, row_id)
    ) as cur:
        return await cur.fetchone()


def _write_applies(row: Optional[aiosqlite.Row], base_seq: Optional[int]) -> bool:
    """D3's table: whether an upsert should be applied."""
    if row is None:
        return True
    is_create = base_seq is None
    if row["deleted_at"] is None:      # live
        return not is_create           # edits win (LWW); creates never overwrite
    return is_create                   # tombstone: creates revive, edits are stale


async def write_entry(
    space_id: str, library_id: str, entry_id: str, base_seq: Optional[int], data: dict
) -> dict:
    """Upsert a library entry under D3's rules. `data` excludes the id.
    Returns {applied, seq, entry} where `entry` is the server's row after the
    call (None for a tombstone)."""
    async with connect() as db:
        await _begin(db)
        await _require_library(db, space_id, library_id)
        row = await _fetch_row(db, "library_entries", space_id, entry_id)
        if row is not None and row["library_id"] != library_id:
            raise LibraryMismatch(entry_id)
        if _write_applies(row, base_seq):
            seq = await _next_seq(db)
            await db.execute(
                "INSERT INTO library_entries "
                "(space_id, id, library_id, data, seq, updated_at, deleted_at) "
                "VALUES (?, ?, ?, ?, ?, ?, NULL) "
                "ON CONFLICT (space_id, id) DO UPDATE SET "
                "data = excluded.data, seq = excluded.seq, "
                "updated_at = excluded.updated_at, deleted_at = NULL",
                (space_id, entry_id, library_id, json.dumps(data), seq, _now()),
            )
            row = await _fetch_row(db, "library_entries", space_id, entry_id)
            applied = True
        else:
            applied = False
        public = _public_entry(row)
        return {"applied": applied, "seq": public["seq"], "entry": public["entry"]}


async def delete_entry(space_id: str, library_id: str, entry_id: str) -> dict:
    """Tombstone a library entry, moving it to the Trash: its data is kept so it
    can be restored until purged (add-trash-and-soft-delete D1). Deleting a live
    row always applies (a delete is a write, LWW); deleting a tombstone is a
    no-op. A delete for an unknown id records a data-less (purged) tombstone so
    a stale device cannot create it later as an edit."""
    async with connect() as db:
        await _begin(db)
        await _require_library(db, space_id, library_id)
        row = await _fetch_row(db, "library_entries", space_id, entry_id)
        if row is not None and row["library_id"] != library_id:
            raise LibraryMismatch(entry_id)
        if row is not None and row["deleted_at"] is not None:
            return {"applied": False, "seq": row["seq"]}
        seq = await _next_seq(db)
        now = _now()
        await db.execute(
            "INSERT INTO library_entries "
            "(space_id, id, library_id, data, seq, updated_at, deleted_at) "
            "VALUES (?, ?, ?, NULL, ?, ?, ?) "
            "ON CONFLICT (space_id, id) DO UPDATE SET "
            "seq = excluded.seq, updated_at = excluded.updated_at, "
            "deleted_at = excluded.deleted_at",
            (space_id, entry_id, library_id, seq, now, now),
        )
        return {"applied": True, "seq": seq}


async def write_profile(
    space_id: str, profile_id: str, base_seq: Optional[int], data: dict
) -> dict:
    """Upsert a profile ({aircraft}) under D3's rules. Returns
    {applied, seq, profile}."""
    async with connect() as db:
        await _begin(db)
        row = await _fetch_row(db, "profiles", space_id, profile_id)
        if _write_applies(row, base_seq):
            seq = await _next_seq(db)
            await db.execute(
                "INSERT INTO profiles (space_id, id, data, seq, updated_at, deleted_at) "
                "VALUES (?, ?, ?, ?, ?, NULL) "
                "ON CONFLICT (space_id, id) DO UPDATE SET "
                "data = excluded.data, seq = excluded.seq, "
                "updated_at = excluded.updated_at, deleted_at = NULL",
                (space_id, profile_id, json.dumps(data), seq, _now()),
            )
            row = await _fetch_row(db, "profiles", space_id, profile_id)
            applied = True
        else:
            applied = False
        public = _public_profile(row)
        return {"applied": applied, "seq": public["seq"], "profile": public["profile"]}


async def delete_profile(space_id: str, profile_id: str) -> dict:
    """Tombstone a profile; same rules as `delete_entry`."""
    async with connect() as db:
        await _begin(db)
        row = await _fetch_row(db, "profiles", space_id, profile_id)
        if row is not None and row["deleted_at"] is not None:
            return {"applied": False, "seq": row["seq"]}
        seq = await _next_seq(db)
        now = _now()
        await db.execute(
            "INSERT INTO profiles (space_id, id, data, seq, updated_at, deleted_at) "
            "VALUES (?, ?, NULL, ?, ?, ?) "
            "ON CONFLICT (space_id, id) DO UPDATE SET "
            "seq = excluded.seq, updated_at = excluded.updated_at, "
            "deleted_at = excluded.deleted_at",
            (space_id, profile_id, seq, now, now),
        )
        return {"applied": True, "seq": seq}


# --- Trash: restore and purge (add-trash-and-soft-delete D1) -----------------

class NotTrashed(Exception):
    """The row is live, purged or unknown, so there is nothing to restore."""


async def _restore(db, table: str, space_id: str, row_id: str) -> aiosqlite.Row:
    row = await _fetch_row(db, table, space_id, row_id)
    if row is None or not _is_trashed(row):
        raise NotTrashed(row_id)
    await db.execute(
        f"UPDATE {table} SET deleted_at = NULL, seq = ?, updated_at = ? "
        "WHERE space_id = ? AND id = ?",
        (await _next_seq(db), _now(), space_id, row_id),
    )
    return await _fetch_row(db, table, space_id, row_id)


async def restore_entry(space_id: str, library_id: str, entry_id: str) -> dict:
    """Bring a trashed entry back with the data it had when deleted, under a new
    `seq` so every device picks it up from the feed. Raises NotTrashed."""
    async with connect() as db:
        await _begin(db)
        await _require_library(db, space_id, library_id)
        row = await _fetch_row(db, "library_entries", space_id, entry_id)
        if row is not None and row["library_id"] != library_id:
            raise LibraryMismatch(entry_id)
        public = _public_entry(await _restore(db, "library_entries", space_id, entry_id))
        return {"seq": public["seq"], "entry": public["entry"]}


async def restore_profile(space_id: str, profile_id: str) -> dict:
    """Bring a trashed profile back; same rules as `restore_entry`."""
    async with connect() as db:
        await _begin(db)
        public = _public_profile(await _restore(db, "profiles", space_id, profile_id))
        return {"seq": public["seq"], "profile": public["profile"]}


async def trashed_assets(space_id: str) -> dict:
    """The space's trashed entries (with their theatre) and profiles, with the
    data they had when deleted. Purged tombstones are not included."""
    async with connect() as db:
        async with db.execute(
            "SELECT e.*, l.theatre FROM library_entries e "
            "JOIN libraries l ON l.id = e.library_id "
            "WHERE e.space_id = ? AND e.deleted_at IS NOT NULL AND e.data IS NOT NULL",
            (space_id,),
        ) as cur:
            entries = [
                {
                    "id": r["id"],
                    "libraryId": r["library_id"],
                    "theatre": r["theatre"],
                    "entry": {"id": r["id"], **json.loads(r["data"])},
                    "deletedAt": r["deleted_at"],
                }
                for r in await cur.fetchall()
            ]
        async with db.execute(
            "SELECT * FROM profiles "
            "WHERE space_id = ? AND deleted_at IS NOT NULL AND data IS NOT NULL",
            (space_id,),
        ) as cur:
            profiles = [
                {
                    "id": r["id"],
                    "profile": {"id": r["id"], **json.loads(r["data"])},
                    "deletedAt": r["deleted_at"],
                }
                for r in await cur.fetchall()
            ]
    return {"entries": entries, "profiles": profiles}


async def live_entries(space_id: str, entry_ids: list[str]) -> dict[str, dict]:
    """The live entries among `entry_ids`, as `{id: {"theatre", "data"}}`, for
    pinning into a plan version (add-version-history D3; AD-3). Trashed and
    purged entries are left out."""
    if not entry_ids:
        return {}
    marks = ", ".join("?" for _ in entry_ids)
    async with connect() as db:
        async with db.execute(
            "SELECT e.id, e.data, l.theatre FROM library_entries e "
            "JOIN libraries l ON l.id = e.library_id "
            f"WHERE e.space_id = ? AND e.id IN ({marks}) "
            "AND e.deleted_at IS NULL AND e.data IS NOT NULL",
            (space_id, *entry_ids),
        ) as cur:
            return {
                r["id"]: {"theatre": r["theatre"], "data": json.loads(r["data"])}
                for r in await cur.fetchall()
            }


async def live_profile(space_id: str, profile_id: str) -> Optional[dict]:
    """A live profile's data, or None when it is trashed, purged or unknown."""
    async with connect() as db:
        async with db.execute(
            "SELECT data FROM profiles WHERE space_id = ? AND id = ? "
            "AND deleted_at IS NULL AND data IS NOT NULL",
            (space_id, profile_id),
        ) as cur:
            row = await cur.fetchone()
    return json.loads(row["data"]) if row else None


async def purge_assets(cutoff: str) -> int:
    """Purge entries and profiles trashed before `cutoff` (an ISO timestamp):
    their data is dropped and each takes a new `seq`, so devices learn the item
    can no longer be restored. The bare tombstone stays (deletions win).
    Returns the number of rows purged."""
    purged = 0
    async with connect() as db:
        await _begin(db)
        for table in ("library_entries", "profiles"):
            async with db.execute(
                f"SELECT space_id, id FROM {table} "
                "WHERE deleted_at IS NOT NULL AND data IS NOT NULL AND deleted_at < ?",
                (cutoff,),
            ) as cur:
                rows = await cur.fetchall()
            for r in rows:
                await db.execute(
                    f"UPDATE {table} SET data = NULL, seq = ?, updated_at = ? "
                    "WHERE space_id = ? AND id = ?",
                    (await _next_seq(db), _now(), r["space_id"], r["id"]),
                )
            purged += len(rows)
    return purged


# --- Change feed -------------------------------------------------------------

async def changes_since(space_id: str, since: int) -> dict:
    """Everything in the space written after `since`, tombstones included, and
    the cursor to pull from next. `since=0` is the initial load."""
    async with connect() as db:
        await db.execute("BEGIN")  # one read snapshot for all three tables
        async with db.execute(
            "SELECT * FROM libraries WHERE space_id = ? AND seq > ? ORDER BY seq",
            (space_id, since),
        ) as cur:
            libraries = [_public_library(r) for r in await cur.fetchall()]
        async with db.execute(
            "SELECT * FROM library_entries WHERE space_id = ? AND seq > ? ORDER BY seq",
            (space_id, since),
        ) as cur:
            entries = [_public_entry(r) for r in await cur.fetchall()]
        async with db.execute(
            "SELECT * FROM profiles WHERE space_id = ? AND seq > ? ORDER BY seq",
            (space_id, since),
        ) as cur:
            profiles = [_public_profile(r) for r in await cur.fetchall()]
    seqs = [r["seq"] for r in (*libraries, *entries, *profiles)]
    return {
        "cursor": max(seqs, default=since),
        "libraries": libraries,
        "entries": entries,
        "profiles": profiles,
    }
