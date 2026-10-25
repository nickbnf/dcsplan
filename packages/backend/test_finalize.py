"""Finalizing plan versions (add-version-history tasks 3.1-3.3; design D2, D3;
spec: version-history — sessions, identity, pinned dependencies)."""
import asyncio
import time
from datetime import datetime, timedelta, timezone

import pytest
from pycrdt import Array, Doc, Map

import assets
import plans
import sync
import versions
from db import connect
from migrations_runner import apply_migrations

ENTRY = {"type": "sam", "lat": 42.0, "lon": 41.0, "name": "SA-10", "range": 25}
PROFILE = {"aircraft": {"model": "F-15E", "regimes": []}}


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", path)
    apply_migrations(path)
    monkeypatch.setattr(sync, "_finalize_locks", {})

    async def seed():
        async with connect() as c:
            await c.execute(
                "INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1', 'personal', NULL, 't')"
            )
            await c.execute("INSERT INTO users (id, discord_id, created_at) VALUES ('u1', 'd1', 't')")
            await c.execute("INSERT INTO users (id, discord_id, created_at) VALUES ('u2', 'd2', 't')")

    asyncio.run(seed())
    return path


def run(coro):
    return asyncio.run(coro)


def lib() -> str:
    return run(assets.libraries_for_theatre("s1", "caucasus"))[0]["id"]


def plan_doc(name="Alpha", points=(), refs=(), profile_id=None) -> Doc:
    doc = Doc()
    fp = doc.get("flightPlan", type=Map)
    fp["name"] = name
    fp["points"] = Array([Map({"id": p, "alt": 1000}) for p in points])
    if refs:
        fp["libraryRefs"] = Array([Map({"uuid": r}) for r in refs])
    if profile_id is not None:
        fp["profileId"] = profile_id
    return doc


def create(plan_id="p1", doc=None):
    update = doc.get_update() if doc is not None else None
    run(plans.create_plan(plan_id, "s1", "Alpha", "caucasus", initial_update=update))


def edit(plan_id, change):
    """Apply `change(fp)` to the plan's stored document, as a later update."""
    doc = Doc()
    for u in run(plans.load_updates(plan_id)):
        doc.apply_update(u)
    before = doc.get_state()
    change(doc.get("flightPlan", type=Map))
    run(plans.append_update(plan_id, doc.get_update(before)))


# --- 3.1 content_hash ----------------------------------------------------------

def test_equal_content_built_in_different_orders_hashes_equal():
    a = Doc()
    fa = a.get("flightPlan", type=Map)
    fa["name"] = "Alpha"
    fa["initFob"] = 9000
    b = Doc()
    fb = b.get("flightPlan", type=Map)
    fb["initFob"] = 9000
    fb["name"] = "Alpha"
    assert sync.content_hash(a) == sync.content_hash(b)


def test_deleting_a_waypoint_changes_the_hash():
    doc = plan_doc(points=("w1", "w2"))
    before = sync.content_hash(doc)
    state = doc.get_state()
    del doc.get("flightPlan", type=Map)["points"][1]
    assert doc.get_state() == state  # the state vector alone would miss it
    assert sync.content_hash(doc) != before


def test_empty_document_hashes_as_empty():
    assert sync.content_hash(Doc()) == sync.EMPTY_CONTENT_HASH
    assert sync.content_hash(plan_doc()) != sync.EMPTY_CONTENT_HASH


# --- 3.2 pin_dependencies ------------------------------------------------------

def test_pins_live_items_and_lists_the_rest_as_missing(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "live", None, ENTRY))
    run(assets.write_entry("s1", lid, "trashed", None, ENTRY))
    run(assets.delete_entry("s1", lid, "trashed"))
    run(assets.delete_entry("s1", lid, "purged"))  # data-less tombstone
    run(assets.write_profile("s1", "pr1", None, PROFILE))
    doc = plan_doc(refs=("live", "trashed", "purged"), profile_id="pr1")

    pinned = run(sync.pin_dependencies("s1", doc))
    assert pinned["entries"] == {"live": {"theatre": "caucasus", "data": ENTRY}}
    assert pinned["profile"] == {"id": "pr1", "data": PROFILE}
    assert pinned["missing"] == {"entries": ["purged", "trashed"], "profile": None}


def test_deleted_profile_is_missing_and_no_profile_pins_null(db_path):
    run(assets.write_profile("s1", "pr1", None, PROFILE))
    run(assets.delete_profile("s1", "pr1"))
    pinned = run(sync.pin_dependencies("s1", plan_doc(profile_id="pr1")))
    assert pinned["profile"] is None
    assert pinned["missing"]["profile"] == "pr1"

    pinned = run(sync.pin_dependencies("s1", plan_doc()))
    assert pinned["profile"] is None
    assert pinned["missing"] == {"entries": [], "profile": None}


# --- 3.3 finalize_plan ---------------------------------------------------------

def test_first_finalize_writes_rev_1_and_unchanged_content_writes_nothing(db_path):
    create(doc=plan_doc(points=("w1",)))
    first = run(sync.finalize_plan("p1"))
    assert first["rev"] == 1
    again = run(sync.finalize_plan("p1"))
    assert again == first
    assert len(run(versions.list_versions("p1"))) == 1


def test_a_plan_without_content_gets_no_version(db_path):
    create()
    assert run(sync.finalize_plan("p1")) is None
    assert run(versions.list_versions("p1")) == []


def test_changed_content_writes_the_next_version_with_editors_and_pins(db_path):
    lid = lib()
    run(assets.write_entry("s1", lid, "x", None, ENTRY))
    create(doc=plan_doc(points=("w1",)))
    run(sync.finalize_plan("p1"))
    run(versions.record_editor("p1", "u2"))
    edit("p1", lambda fp: fp.__setitem__("libraryRefs", Array([Map({"uuid": "x"})])))

    version = run(sync.finalize_plan("p1"))
    assert version["rev"] == 2
    assert version["editors"] == ["u2"]
    assert run(versions.pinned_entries("p1")) == {"x": {"theatre": "caucasus", "data": ENTRY}}

    state = run(versions.get_version_state("p1", 2))
    restored = Doc()
    restored.apply_update(state)
    assert sync.content_hash(restored) == version["content_hash"]


def test_a_restore_always_writes_a_version_credited_to_the_actor(db_path):
    create(doc=plan_doc(points=("w1",)))
    run(sync.finalize_plan("p1"))
    run(versions.record_editor("p1", "u2"))
    version = run(sync.finalize_plan("p1", restored_from=1, actor="u1"))
    assert version["rev"] == 2
    assert version["editors"] == ["u1"]
    assert version["restored_from"] == 1


def test_a_supplied_update_is_merged_before_hashing_and_credits_the_actor(db_path):
    doc = plan_doc(points=("w1",))
    create(doc=doc)
    run(sync.finalize_plan("p1"))
    doc.get("flightPlan", type=Map)["name"] = "Renamed on device"

    version = run(sync.finalize_plan("p1", update=doc.get_update(), actor="u1"))
    assert version["rev"] == 2
    assert version["editors"] == ["u1"]
    stored = Doc()
    for u in run(plans.load_updates("p1")):
        stored.apply_update(u)
    assert stored.get("flightPlan", type=Map)["name"] == "Renamed on device"


def test_an_update_with_nothing_new_returns_the_latest(db_path):
    doc = plan_doc(points=("w1",))
    create(doc=doc)
    first = run(sync.finalize_plan("p1"))
    assert run(sync.finalize_plan("p1", update=doc.get_update(), actor="u1")) == first
    assert not run(versions.has_pending_editors("p1"))


def test_concurrent_finalizations_produce_one_version(db_path):
    create(doc=plan_doc(points=("w1",)))

    async def both():
        return await asyncio.gather(sync.finalize_plan("p1"), sync.finalize_plan("p1"))

    a, b = run(both())
    assert a["rev"] == b["rev"] == 1
    assert len(run(versions.list_versions("p1"))) == 1


def test_a_trashed_plan_is_not_finalized(db_path):
    create(doc=plan_doc(points=("w1",)))
    run(plans.trash_plan("p1"))
    assert run(sync.finalize_plan("p1")) is None


def test_unchanged_content_clears_the_pending_editors(db_path):
    """An edit reverted within the session leaves nothing to finalize."""
    create(doc=plan_doc(points=("w1",)))
    run(sync.finalize_plan("p1"))
    run(versions.record_editor("p1", "u2"))
    run(sync.finalize_plan("p1"))
    assert not run(versions.has_pending_editors("p1"))


# --- 4.3 Inactivity sweep ------------------------------------------------------

def _edited_minutes_ago(plan_id, user_id, minutes):
    when = (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()

    async def go():
        async with connect() as c:
            await c.execute(
                "INSERT INTO plan_pending_editors (plan_id, user_id, last_edit_at) VALUES (?, ?, ?)",
                (plan_id, user_id, when),
            )
    run(go())


def test_sweep_finalizes_plans_idle_for_ten_minutes_only(db_path):
    create("idle", doc=plan_doc(points=("w1",)))
    create("busy", doc=plan_doc(points=("w1",)))
    _edited_minutes_ago("idle", "u1", 11)
    _edited_minutes_ago("busy", "u1", 9)
    assert run(sync.finalize_idle_plans()) == 1
    assert [v["rev"] for v in run(versions.list_versions("idle"))] == [1]
    assert run(versions.list_versions("busy")) == []


def test_sweep_waits_for_the_last_editor(db_path):
    create(doc=plan_doc(points=("w1",)))
    _edited_minutes_ago("p1", "u1", 30)
    _edited_minutes_ago("p1", "u2", 2)
    assert run(sync.finalize_idle_plans()) == 0


def test_sweep_skips_plans_without_edits_since_their_version(db_path):
    create(doc=plan_doc(points=("w1",)))
    run(sync.finalize_plan("p1"))
    assert run(sync.finalize_idle_plans()) == 0


def test_sweep_skips_trashed_plans(db_path):
    create(doc=plan_doc(points=("w1",)))
    _edited_minutes_ago("p1", "u1", 11)
    run(plans.trash_plan("p1"))
    assert run(sync.finalize_idle_plans()) == 0


def test_lifespan_sweep_runs_at_start_and_is_cancelled(monkeypatch):
    calls = []

    async def fake_sweep():
        calls.append(1)
        return 0

    monkeypatch.setattr(sync, "finalize_idle_plans", fake_sweep)

    async def body():
        async with sync.lifespan_sweep(interval=3600) as task:
            await asyncio.sleep(0.01)
            assert calls == [1]
        assert task.cancelled()

    run(body())


def test_app_lifespan_starts_the_sweep(db_path, monkeypatch):
    from fastapi.testclient import TestClient
    import main

    calls = []

    async def fake_sweep():
        calls.append(1)
        return 0

    monkeypatch.setattr(sync, "finalize_idle_plans", fake_sweep)
    monkeypatch.setattr(main, "apply_migrations", lambda *a, **k: None)
    with TestClient(main.app):
        time.sleep(0.05)
    assert calls == [1]
