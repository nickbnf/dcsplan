"""Reference lookups by reading plan documents (add-trash-and-soft-delete task
3.4; spec: soft-delete; design D3)."""
import asyncio
from types import SimpleNamespace

import pytest
from pycrdt import Array, Doc, Map

import plans
import sync
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
    monkeypatch.setattr(sync.sync_server, "rooms", {})
    return path


def run(coro):
    return asyncio.run(coro)


def plan_doc(profile_id=None, entry_ids=()) -> Doc:
    """A document shaped like the client's binding (yjsFlightPlanBinding)."""
    doc = Doc()
    y_plan = doc.get("flightPlan", type=Map)
    y_plan["name"] = "Plan"
    if profile_id is not None:
        y_plan["profileId"] = profile_id
    if entry_ids:
        y_plan["libraryRefs"] = Array([Map({"uuid": e, "comment": ""}) for e in entry_ids])
    return doc


def add_plan(plan_id, doc, space="s1"):
    run(plans.create_plan(plan_id, space, "Plan", "caucasus", initial_update=doc.get_update()))


def test_reads_profile_and_library_refs(db_path):
    add_plan("p1", plan_doc("prof-a", ["e1", "e2"]))
    [refs] = run(sync.plan_refs("s1"))
    assert refs == sync.PlanRefs("p1", "prof-a", frozenset({"e1", "e2"}))


def test_plan_without_refs(db_path):
    add_plan("p1", plan_doc())
    [refs] = run(sync.plan_refs("s1"))
    assert refs.profile_id is None and refs.entry_ids == frozenset()


def test_counts_exclude_trashed_plans_and_other_spaces(db_path):
    add_plan("p1", plan_doc("prof-a", ["e1"]))
    add_plan("p2", plan_doc("prof-a", ["e1"]))
    add_plan("p3", plan_doc("prof-a", ["e1"]))
    add_plan("p4", plan_doc("prof-a", ["e1"]), space="s2")
    run(plans.trash_plan("p3"))
    assert run(sync.count_profile_refs("s1", "prof-a")) == 2
    assert run(sync.count_entry_refs("s1", "e1")) == 2
    assert run(sync.count_profile_refs("s1", "prof-b")) == 0
    assert run(sync.count_entry_refs("s1", "e9")) == 0


def test_open_room_state_is_read(db_path, monkeypatch):
    add_plan("p1", plan_doc("prof-a"))
    live = plan_doc("prof-b", ["e7"])  # edits the room holds, not yet in the log
    monkeypatch.setitem(sync.sync_server.rooms, "p1", SimpleNamespace(ydoc=live))
    [refs] = run(sync.plan_refs("s1"))
    assert refs.profile_id == "prof-b" and refs.entry_ids == frozenset({"e7"})


def test_log_with_several_updates_is_replayed(db_path):
    doc = plan_doc("prof-a")
    add_plan("p1", doc)
    doc.get("flightPlan", type=Map)["profileId"] = "prof-c"
    run(plans.append_update("p1", doc.get_update()))
    [refs] = run(sync.plan_refs("s1"))
    assert refs.profile_id == "prof-c"
