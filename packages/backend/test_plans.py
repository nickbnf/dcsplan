"""Plan index + plan-update log tests (task 2.2; spec: space — unique names,
plan-sync — persistence)."""
import asyncio

import pytest
from pycrdt import Doc, Map

import plans
from db import connect
from migrations_runner import apply_migrations
from plans import DuplicatePlanName


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", path)
    apply_migrations(path)
    return path


def _seed_space(space_id: str = "s1") -> str:
    async def go():
        async with connect() as c:
            await c.execute(
                "INSERT INTO spaces (id, kind, name, created_at) VALUES (?, 'personal', NULL, 't')",
                (space_id,),
            )
    asyncio.run(go())
    return space_id


# --- Plan index -----------------------------------------------------------

def test_create_and_list(db_path):
    sid = _seed_space()
    created = asyncio.run(plans.create_plan("p1", sid, "Alpha", "caucasus"))
    assert created["name"] == "Alpha" and created["theatre"] == "caucasus"
    listed = asyncio.run(plans.list_plans(sid))
    assert [p["id"] for p in listed] == ["p1"]


def test_duplicate_name_rejected_in_same_space(db_path):
    sid = _seed_space()
    asyncio.run(plans.create_plan("p1", sid, "Alpha", "caucasus"))
    with pytest.raises(DuplicatePlanName):
        asyncio.run(plans.create_plan("p2", sid, "Alpha", "caucasus"))


def test_same_name_allowed_in_different_space(db_path):
    s1 = _seed_space("s1")
    s2 = _seed_space("s2")
    asyncio.run(plans.create_plan("p1", s1, "Alpha", "caucasus"))
    other = asyncio.run(plans.create_plan("p2", s2, "Alpha", "caucasus"))
    assert other["id"] == "p2"


def test_rename_unique_and_collision(db_path):
    sid = _seed_space()
    asyncio.run(plans.create_plan("p1", sid, "Alpha", "caucasus"))
    asyncio.run(plans.create_plan("p2", sid, "Bravo", "caucasus"))

    updated = asyncio.run(plans.rename_plan("p2", sid, "Charlie"))
    assert updated["name"] == "Charlie"

    with pytest.raises(DuplicatePlanName):
        asyncio.run(plans.rename_plan("p2", sid, "Alpha"))


def test_rename_plan_not_in_space_returns_none(db_path):
    s1 = _seed_space("s1")
    s2 = _seed_space("s2")
    asyncio.run(plans.create_plan("p1", s1, "Alpha", "caucasus"))
    assert asyncio.run(plans.rename_plan("p1", s2, "X")) is None


def test_list_excludes_soft_deleted(db_path):
    sid = _seed_space()
    asyncio.run(plans.create_plan("p1", sid, "Alpha", "caucasus"))

    async def soft_delete():
        async with connect() as c:
            await c.execute("UPDATE plans SET deleted_at = 't' WHERE id = 'p1'")

    asyncio.run(soft_delete())
    assert asyncio.run(plans.list_plans(sid)) == []


# --- Plan-update log ------------------------------------------------------

def test_append_then_load_preserves_document_state(db_path):
    _seed_space()
    asyncio.run(plans.create_plan("p1", "s1", "Alpha", "caucasus"))

    doc = Doc()
    doc.get("data", type=Map)["hello"] = "world"
    asyncio.run(plans.append_update("p1", doc.get_update()))

    loaded = asyncio.run(plans.load_updates("p1"))
    assert len(loaded) == 1

    replay = Doc()
    replay.apply_update(loaded[0])
    assert replay.get("data", type=Map)["hello"] == "world"


def test_squash_reduces_rows_preserving_state(db_path):
    _seed_space()
    asyncio.run(plans.create_plan("p1", "s1", "Alpha", "caucasus"))

    doc = Doc()
    m = doc.get("data", type=Map)
    m["a"] = 1
    asyncio.run(plans.append_update("p1", doc.get_update()))
    m["b"] = 2
    asyncio.run(plans.append_update("p1", doc.get_update()))
    assert asyncio.run(plans.count_updates("p1")) == 2

    merged = Doc()
    for u in asyncio.run(plans.load_updates("p1")):
        merged.apply_update(u)
    asyncio.run(plans.squash_updates("p1", merged.get_update()))

    assert asyncio.run(plans.count_updates("p1")) == 1
    replay = Doc()
    replay.apply_update(asyncio.run(plans.load_updates("p1"))[0])
    rm = replay.get("data", type=Map)
    assert rm["a"] == 1 and rm["b"] == 2
