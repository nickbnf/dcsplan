"""Library/profile data-access tests (add-library-profile-sync, tasks 1.2-1.4;
spec: space-asset-sync, space; design D1-D3)."""
import asyncio

import pytest

import assets
from assets import LibraryMismatch, UnknownLibrary
from db import connect
from migrations_runner import apply_migrations


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", path)
    apply_migrations(path)

    async def seed():
        async with connect() as c:
            for sid in ("s1", "s2"):
                await c.execute(
                    "INSERT INTO spaces (id, kind, name, created_at) VALUES (?, 'personal', NULL, 't')",
                    (sid,),
                )
    asyncio.run(seed())
    return path


def run(coro):
    return asyncio.run(coro)


def lib(space="s1", theatre="caucasus") -> str:
    libs = run(assets.libraries_for_theatre(space, theatre))
    assert len(libs) == 1
    return libs[0]["id"]


ENTRY = {"type": "sam", "lat": 42.0, "lon": 41.0, "name": "SA-10", "range": 25}


# --- 1.2 Libraries and seq -----------------------------------------------------

def test_library_get_or_create_is_idempotent(db_path):
    first = run(assets.libraries_for_theatre("s1", "caucasus"))
    second = run(assets.libraries_for_theatre("s1", "caucasus"))
    assert first == second
    assert first[0]["theatre"] == "caucasus" and first[0]["name"] is None
    assert first[0]["parentId"] is None


def test_two_spaces_get_distinct_libraries(db_path):
    assert lib("s1") != lib("s2")
    assert lib("s1", "caucasus") != lib("s1", "syria")


def test_every_write_strictly_increases_seq(db_path):
    lid = lib()
    seqs = [
        run(assets.write_entry("s1", lid, "e1", None, ENTRY))["seq"],
        run(assets.write_profile("s1", "p1", None, {"aircraft": {"model": "F-15E"}}))["seq"],
        run(assets.write_entry("s1", lid, "e1", 2, {**ENTRY, "name": "SA-11"}))["seq"],
        run(assets.delete_entry("s1", lid, "e1"))["seq"],
    ]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)


# --- 1.3 D3 write rules --------------------------------------------------------

def test_create_new_row_applies(db_path):
    res = run(assets.write_entry("s1", lib(), "e1", None, ENTRY))
    assert res["applied"] is True
    assert res["entry"] == {"id": "e1", **ENTRY}


def test_edit_of_missing_row_applies(db_path):
    res = run(assets.write_entry("s1", lib(), "e1", 7, ENTRY))
    assert res["applied"] is True


def test_edit_of_live_row_applies_last_write_wins(db_path):
    lid = lib()
    created = run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    edited = run(assets.write_entry("s1", lid, "e1", created["seq"], {**ENTRY, "name": "SA-11"}))
    assert edited["applied"] is True and edited["entry"]["name"] == "SA-11"
    # A stale base still wins: LWW does not reject on an old baseSeq.
    stale = run(assets.write_entry("s1", lid, "e1", created["seq"], {**ENTRY, "name": "SA-15"}))
    assert stale["applied"] is True and stale["entry"]["name"] == "SA-15"


def test_create_over_live_row_is_ignored_and_returns_server_row(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    res = run(assets.write_entry("s1", lid, "e1", None, {**ENTRY, "lat": 10.0}))
    assert res["applied"] is False
    assert res["entry"]["lat"] == 42.0


def test_edit_over_tombstone_is_ignored(db_path):
    lid = lib()
    created = run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    run(assets.delete_entry("s1", lid, "e1"))
    res = run(assets.write_entry("s1", lid, "e1", created["seq"], {**ENTRY, "name": "x"}))
    assert res["applied"] is False and res["entry"] is None


def test_create_over_tombstone_revives(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    run(assets.delete_entry("s1", lid, "e1"))
    res = run(assets.write_entry("s1", lid, "e1", None, {**ENTRY, "name": "back"}))
    assert res["applied"] is True and res["entry"]["name"] == "back"


def test_delete_of_tombstone_is_noop(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    first = run(assets.delete_entry("s1", lid, "e1"))
    second = run(assets.delete_entry("s1", lid, "e1"))
    assert first["applied"] is True and second == {"applied": False, "seq": first["seq"]}


def test_same_entry_id_in_two_spaces_does_not_collide(db_path):
    run(assets.write_entry("s1", lib("s1"), "e1", None, ENTRY))
    res = run(assets.write_entry("s2", lib("s2"), "e1", None, {**ENTRY, "name": "other"}))
    assert res["applied"] is True and res["entry"]["name"] == "other"


def test_write_naming_another_library_is_refused(db_path):
    run(assets.write_entry("s1", lib("s1", "caucasus"), "e1", None, ENTRY))
    with pytest.raises(LibraryMismatch):
        run(assets.write_entry("s1", lib("s1", "syria"), "e1", None, ENTRY))


def test_library_of_another_space_is_unknown(db_path):
    with pytest.raises(UnknownLibrary):
        run(assets.write_entry("s1", lib("s2"), "e1", None, ENTRY))


def test_profile_rules_match_entries(db_path):
    p = {"aircraft": {"model": "F-15E"}}
    created = run(assets.write_profile("s1", "p1", None, p))
    assert created["applied"] and created["profile"] == {"id": "p1", **p}
    assert run(assets.write_profile("s1", "p1", None, {"aircraft": {"model": "x"}}))["applied"] is False
    run(assets.delete_profile("s1", "p1"))
    assert run(assets.write_profile("s1", "p1", created["seq"], p))["applied"] is False
    assert run(assets.write_profile("s1", "p1", None, p))["applied"] is True


# --- 1.4 Change feed -----------------------------------------------------------

def test_changes_since_zero_returns_everything(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    run(assets.write_entry("s1", lid, "e2", None, ENTRY))
    run(assets.delete_entry("s1", lid, "e2"))
    run(assets.write_profile("s1", "p1", None, {"aircraft": {}}))
    feed = run(assets.changes_since("s1", 0))
    assert [l["id"] for l in feed["libraries"]] == [lid]
    assert {(e["id"], e["deleted"]) for e in feed["entries"]} == {("e1", False), ("e2", True)}
    assert [p["id"] for p in feed["profiles"]] == ["p1"]
    assert feed["cursor"] == max(
        x["seq"] for x in (*feed["libraries"], *feed["entries"], *feed["profiles"])
    )


def test_changes_since_cursor_returns_only_newer_rows(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    cursor = run(assets.changes_since("s1", 0))["cursor"]
    assert run(assets.changes_since("s1", cursor)) == {
        "cursor": cursor, "libraries": [], "entries": [], "profiles": [],
    }
    run(assets.write_entry("s1", lid, "e2", None, ENTRY))
    feed = run(assets.changes_since("s1", cursor))
    assert [e["id"] for e in feed["entries"]] == ["e2"] and feed["cursor"] > cursor


def test_changes_never_include_other_spaces(db_path):
    run(assets.write_entry("s2", lib("s2"), "e1", None, ENTRY))
    run(assets.write_profile("s2", "p1", None, {"aircraft": {}}))
    feed = run(assets.changes_since("s1", 0))
    assert feed["libraries"] == [] and feed["entries"] == [] and feed["profiles"] == []


# --- add-trash-and-soft-delete 1.2-1.3: tombstones keep data; trashed flag ----

def _raw_row(table, space_id, row_id):
    async def go():
        async with connect() as c:
            async with c.execute(
                f"SELECT data, deleted_at FROM {table} WHERE space_id = ? AND id = ?",
                (space_id, row_id),
            ) as cur:
                return await cur.fetchone()
    return run(go())


def test_delete_keeps_entry_data(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    run(assets.delete_entry("s1", lid, "e1"))
    row = _raw_row("library_entries", "s1", "e1")
    assert row["deleted_at"] is not None
    assert row["data"] is not None and '"SA-10"' in row["data"]


def test_delete_keeps_profile_data(db_path):
    run(assets.write_profile("s1", "p1", None, {"aircraft": {"model": "F-15E"}}))
    run(assets.delete_profile("s1", "p1"))
    row = _raw_row("profiles", "s1", "p1")
    assert row["deleted_at"] is not None and "F-15E" in row["data"]


def test_delete_of_unknown_id_records_dataless_tombstone(db_path):
    run(assets.delete_entry("s1", lib(), "ghost"))
    run(assets.delete_profile("s1", "ghost"))
    assert _raw_row("library_entries", "s1", "ghost")["data"] is None
    assert _raw_row("profiles", "s1", "ghost")["data"] is None


def test_feed_marks_live_trashed_and_purged_rows(db_path):
    lid = lib()
    for eid in ("live", "trashed"):
        run(assets.write_entry("s1", lid, eid, None, ENTRY))
    run(assets.delete_entry("s1", lid, "trashed"))
    run(assets.delete_entry("s1", lid, "purged"))  # unknown id: data-less tombstone
    run(assets.write_profile("s1", "p1", None, {"aircraft": {}}))
    run(assets.delete_profile("s1", "p1"))
    feed = run(assets.changes_since("s1", 0))
    rows = {e["id"]: e for e in feed["entries"]}
    assert (rows["live"]["deleted"], rows["live"]["trashed"]) == (False, False)
    assert rows["live"]["entry"]["name"] == "SA-10"
    assert (rows["trashed"]["deleted"], rows["trashed"]["trashed"]) == (True, True)
    assert rows["trashed"]["entry"] is None  # trashed content is never in the feed
    assert (rows["purged"]["deleted"], rows["purged"]["trashed"]) == (True, False)
    [profile] = feed["profiles"]
    assert profile["trashed"] is True and profile["profile"] is None
