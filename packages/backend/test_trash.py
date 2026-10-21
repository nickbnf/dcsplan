"""Trash tests: restore, listing and purge (add-trash-and-soft-delete tasks
2.1-2.3; spec: soft-delete, space-asset-sync; design D1, D7)."""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import pytest
from pycrdt import Doc, Map

import assets
import plans
import trash
from assets import NotTrashed
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
    return run(assets.libraries_for_theatre(space, theatre))[0]["id"]


ENTRY = {"type": "sam", "lat": 42.0, "lon": 41.0, "name": "SA-10", "range": 25}
PROFILE = {"aircraft": {"model": "F-15E", "regimes": [{"id": "r1", "name": "Cruise"}]}}


def plan_with_content(plan_id="p1", space="s1", name="Alpha"):
    doc = Doc()
    doc.get("flightPlan", type=Map)["name"] = name
    run(plans.create_plan(plan_id, space, name, "caucasus", initial_update=doc.get_update()))


def age(table, row_id, days):
    """Backdate a row's deletion by `days`."""
    when = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    async def go():
        async with connect() as c:
            await c.execute(f"UPDATE {table} SET deleted_at = ? WHERE id = ?", (when, row_id))
    run(go())


# --- 2.1 Restore ---------------------------------------------------------------

def test_restore_entry_brings_back_data_under_new_seq(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    deleted = run(assets.delete_entry("s1", lid, "e1"))
    restored = run(assets.restore_entry("s1", lid, "e1"))
    assert restored["entry"] == {"id": "e1", **ENTRY}
    assert restored["seq"] > deleted["seq"]
    feed = run(assets.changes_since("s1", deleted["seq"]))
    [row] = feed["entries"]
    assert row["deleted"] is False and row["trashed"] is False and row["entry"]["name"] == "SA-10"


def test_restore_profile_keeps_id_and_regimes(db_path):
    run(assets.write_profile("s1", "p1", None, PROFILE))
    run(assets.delete_profile("s1", "p1"))
    restored = run(assets.restore_profile("s1", "p1"))
    assert restored["profile"] == {"id": "p1", **PROFILE}


def test_restore_refuses_live_unknown_and_purged_assets(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "live", None, ENTRY))
    with pytest.raises(NotTrashed):
        run(assets.restore_entry("s1", lid, "live"))
    with pytest.raises(NotTrashed):
        run(assets.restore_entry("s1", lid, "unknown"))
    run(assets.delete_entry("s1", lid, "ghost"))  # data-less tombstone = purged
    with pytest.raises(NotTrashed):
        run(assets.restore_entry("s1", lid, "ghost"))
    with pytest.raises(NotTrashed):
        run(assets.restore_profile("s1", "unknown"))


def test_restore_entry_of_other_space_is_refused(db_path):
    lid = lib("s1")
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    run(assets.delete_entry("s1", lid, "e1"))
    with pytest.raises(assets.UnknownLibrary):
        run(assets.restore_entry("s2", lid, "e1"))
    with pytest.raises(NotTrashed):
        run(assets.restore_entry("s2", lib("s2"), "e1"))


def test_restore_plan_keeps_its_content(db_path):
    plan_with_content()
    run(plans.trash_plan("p1"))
    assert run(plans.restore_plan("p1")) is True
    assert [p["id"] for p in run(plans.list_plans("s1"))] == ["p1"]
    replay = Doc()
    for update in run(plans.load_updates("p1")):
        replay.apply_update(update)
    assert replay.get("flightPlan", type=Map)["name"] == "Alpha"


def test_restore_plan_refuses_live_unknown_and_purged(db_path):
    plan_with_content()
    assert run(plans.restore_plan("p1")) is False  # live
    assert run(plans.restore_plan("nope")) is False
    run(plans.trash_plan("p1"))
    age("plans", "p1", 31)
    run(trash.purge_expired())
    assert run(plans.restore_plan("p1")) is False


# --- 2.2 Listing ---------------------------------------------------------------

def test_trash_lists_all_kinds_newest_first(db_path):
    lid = lib()
    plan_with_content("p1", name="Alpha")
    plan_with_content("p2", name="Bravo")
    run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    run(assets.write_profile("s1", "pr1", None, PROFILE))
    run(plans.trash_plan("p1"))
    run(plans.trash_plan("p2"))
    age("plans", "p1", 2)
    run(assets.delete_entry("s1", lid, "e1"))
    run(assets.delete_profile("s1", "pr1"))
    contents = run(trash.trash_contents("s1"))
    assert [p["id"] for p in contents["plans"]] == ["p2", "p1"]
    assert contents["plans"][0]["name"] == "Bravo" and contents["plans"][0]["theatre"] == "caucasus"
    [entry] = contents["entries"]
    assert entry["theatre"] == "caucasus" and entry["entry"]["name"] == "SA-10"
    [profile] = contents["profiles"]
    assert profile["profile"]["aircraft"]["model"] == "F-15E"
    assert contents["retentionDays"] == 30


def test_trash_excludes_live_purged_and_other_spaces(db_path):
    plan_with_content("p1")
    plan_with_content("p2", space="s2")
    run(plans.trash_plan("p2"))
    run(assets.write_profile("s2", "pr1", None, PROFILE))
    run(assets.delete_profile("s2", "pr1"))
    run(assets.delete_entry("s1", lib(), "ghost"))  # purged tombstone
    assert run(trash.trash_contents("s1")) == {
        "plans": [], "entries": [], "profiles": [], "retentionDays": 30,
    }


# --- 2.3 Purge -----------------------------------------------------------------

def test_purge_after_retention_keeps_recent_items(db_path):
    lid = lib()
    plan_with_content("old")
    plan_with_content("new")
    for eid in ("old", "new"):
        run(assets.write_entry("s1", lid, eid, None, ENTRY))
        run(assets.delete_entry("s1", lid, eid))
        run(plans.trash_plan(eid))
    for table in ("plans", "library_entries"):
        age(table, "old", 31)
        age(table, "new", 29)
    assert run(trash.purge_expired()) == {"plans": 1, "assets": 1}
    contents = run(trash.trash_contents("s1"))
    assert [p["id"] for p in contents["plans"]] == ["new"]
    assert [e["id"] for e in contents["entries"]] == ["new"]
    assert run(plans.count_updates("old")) == 0
    assert run(plans.get_plan("old"))["purged_at"] is not None
    assert run(plans.count_updates("new")) == 1


def test_purge_reaches_the_feed(db_path):
    run(assets.write_profile("s1", "pr1", None, PROFILE))
    deleted = run(assets.delete_profile("s1", "pr1"))
    age("profiles", "pr1", 31)
    run(trash.purge_expired())
    [row] = run(assets.changes_since("s1", deleted["seq"]))["profiles"]
    assert row["deleted"] is True and row["trashed"] is False


def test_purged_item_stays_deleted_against_stale_edits(db_path):
    lid = lib()
    created = run(assets.write_entry("s1", lid, "e1", None, ENTRY))
    run(assets.delete_entry("s1", lid, "e1"))
    age("library_entries", "e1", 31)
    run(trash.purge_expired())
    res = run(assets.write_entry("s1", lid, "e1", created["seq"], ENTRY))
    assert res["applied"] is False


def test_purge_is_idempotent(db_path):
    plan_with_content()
    run(plans.trash_plan("p1"))
    age("plans", "p1", 31)
    assert run(trash.purge_expired())["plans"] == 1
    assert run(trash.purge_expired()) == {"plans": 0, "assets": 0}


def test_purged_plan_id_cannot_be_registered_again(db_path):
    plan_with_content()
    run(plans.trash_plan("p1"))
    age("plans", "p1", 31)
    run(trash.purge_expired())
    with pytest.raises(plans.DuplicatePlanId):
        run(plans.create_plan("p1", "s1", "Again", "caucasus"))


# --- 2.4 Purge job -------------------------------------------------------------

def test_lifespan_purge_runs_at_start_and_is_cancelled(monkeypatch):
    calls = []

    async def fake_purge():
        calls.append(1)
        return {"plans": 0, "assets": 0}

    monkeypatch.setattr(trash, "purge_expired", fake_purge)

    async def body():
        async with trash.lifespan_purge(interval=3600) as task:
            await asyncio.sleep(0.01)
            assert calls == [1]  # ran once at startup, then sleeps
        assert task.cancelled()

    run(body())


def test_failed_purge_run_is_retried(monkeypatch):
    calls = []

    async def flaky():
        calls.append(1)
        if len(calls) == 1:
            raise RuntimeError("db locked")
        return {"plans": 0, "assets": 0}

    monkeypatch.setattr(trash, "purge_expired", flaky)

    async def body():
        async with trash.lifespan_purge(interval=0.01):
            await asyncio.sleep(0.05)

    run(body())
    assert len(calls) >= 2


def test_app_lifespan_starts_the_purge(db_path, monkeypatch):
    from fastapi.testclient import TestClient
    import main

    calls = []

    async def fake_purge():
        calls.append(1)
        return {"plans": 0, "assets": 0}

    monkeypatch.setattr(trash, "purge_expired", fake_purge)
    monkeypatch.setattr(main, "apply_migrations", lambda *a, **k: None)
    with TestClient(main.app):
        time.sleep(0.05)  # the app's loop runs in the client's thread
    assert calls == [1]
