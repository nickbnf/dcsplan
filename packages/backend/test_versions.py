"""Plan-version storage tests (add-version-history, task 2.2; design D1, D4;
spec: version-history — version identity, pinned dependencies)."""
import asyncio

import pytest

import plans
import versions
from db import connect
from migrations_runner import apply_migrations

LATER = "9999-12-31T00:00:00+00:00"  # a cutoff after every recorded edit


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", path)
    apply_migrations(path)

    async def seed():
        async with connect() as c:
            await c.execute(
                "INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1', 'personal', NULL, 't')"
            )
            for uid, name in (("u1", "Falcon"), ("u2", "Viper"), ("u3", "Hawk")):
                await c.execute(
                    "INSERT INTO users (id, discord_id, display_name, created_at) VALUES (?, ?, ?, 't')",
                    (uid, f"d-{uid}", name),
                )
        await plans.create_plan("p1", "s1", "Alpha", "caucasus")
        await plans.create_plan("p2", "s1", "Bravo", "caucasus")

    asyncio.run(seed())
    return path


def _insert(plan_id, **kwargs):
    kwargs.setdefault("cutoff", LATER)
    return asyncio.run(
        versions.insert_version(plan_id, b"state", "hash", {"entries": {}}, **kwargs)
    )


def _clock(monkeypatch, *stamps):
    """Make `versions._now` return `stamps` in turn."""
    it = iter(stamps)
    monkeypatch.setattr(versions, "_now", lambda: next(it))


def test_revs_start_at_one_and_increase_per_plan(db_path):
    assert [_insert("p1")["rev"] for _ in range(3)] == [1, 2, 3]
    assert _insert("p2")["rev"] == 1
    assert [v["rev"] for v in asyncio.run(versions.list_versions("p1"))] == [3, 2, 1]
    assert asyncio.run(versions.latest_version("p1"))["rev"] == 3
    assert asyncio.run(versions.latest_version("p2"))["rev"] == 1


def test_no_version_means_none(db_path):
    assert asyncio.run(versions.latest_version("p1")) is None
    assert asyncio.run(versions.get_version_state("p1", 1)) is None


def test_version_state_round_trips(db_path):
    asyncio.run(versions.insert_version("p1", b"\x01\x02", "h", {}, cutoff=LATER))
    assert asyncio.run(versions.get_version_state("p1", 1)) == b"\x01\x02"


def test_record_editor_twice_keeps_one_row_with_the_later_time(db_path, monkeypatch):
    _clock(monkeypatch, "2026-01-01T10:00:00+00:00", "2026-01-01T10:05:00+00:00")
    asyncio.run(versions.record_editor("p1", "u1"))
    asyncio.run(versions.record_editor("p1", "u1"))

    async def rows():
        async with connect() as c:
            async with c.execute("SELECT * FROM plan_pending_editors") as cur:
                return [dict(r) for r in await cur.fetchall()]

    assert [(r["user_id"], r["last_edit_at"]) for r in asyncio.run(rows())] == [
        ("u1", "2026-01-01T10:05:00+00:00")
    ]


def test_version_takes_pending_editors_last_editor_first(db_path, monkeypatch):
    _clock(
        monkeypatch,
        "2026-01-01T10:00:00+00:00",  # u2
        "2026-01-01T10:01:00+00:00",  # u3
        "2026-01-01T10:02:00+00:00",  # u1, the last editor
        "2026-01-01T10:20:00+00:00",  # finalized_at
    )
    for uid in ("u2", "u3", "u1"):
        asyncio.run(versions.record_editor("p1", uid))
    version = _insert("p1")
    assert version["editors"] == ["u1", "u3", "u2"]
    assert not asyncio.run(versions.has_pending_editors("p1"))


def test_edits_after_the_cutoff_wait_for_the_next_version(db_path, monkeypatch):
    _clock(
        monkeypatch,
        "2026-01-01T10:00:00+00:00",  # u1, before the cutoff
        "2026-01-01T10:10:00+00:00",  # u2, after it
        "2026-01-01T10:11:00+00:00",  # finalized_at
    )
    asyncio.run(versions.record_editor("p1", "u1"))
    asyncio.run(versions.record_editor("p1", "u2"))
    version = _insert("p1", cutoff="2026-01-01T10:05:00+00:00")
    assert version["editors"] == ["u1"]
    assert asyncio.run(versions.has_pending_editors("p1"))


def test_restore_is_credited_to_the_actor_alone(db_path):
    asyncio.run(versions.record_editor("p1", "u2"))
    version = _insert("p1", actor="u1", restored_from=3)
    assert version["editors"] == ["u1"]
    assert version["restored_from"] == 3


def test_editor_fallbacks(db_path):
    asyncio.run(versions.record_editor("p1", "u2"))
    assert _insert("p1")["editors"] == ["u2"]
    # No pending editor: the actor who caused the finalization…
    assert _insert("p1", actor="u3")["editors"] == ["u3"]
    # …else the previous version's editors.
    assert _insert("p1")["editors"] == ["u3"]
    # A first version with nobody to credit has no editors.
    assert _insert("p2")["editors"] == []


def test_pinned_entries_come_from_the_newest_version_holding_them(db_path):
    old_x = {"theatre": "caucasus", "data": {"name": "X", "lat": 1}}
    new_x = {"theatre": "caucasus", "data": {"name": "X", "lat": 2}}
    y = {"theatre": "caucasus", "data": {"name": "Y"}}

    async def go():
        await versions.insert_version("p1", b"s", "h", {"entries": {"x": old_x, "y": y}}, cutoff=LATER)
        await versions.insert_version("p1", b"s", "h", {"entries": {"x": new_x}}, cutoff=LATER)
        await versions.insert_version("p1", b"s", "h", {"entries": {}}, cutoff=LATER)
        return await versions.pinned_entries("p1")

    assert asyncio.run(go()) == {"x": new_x, "y": y}


def test_display_names(db_path):
    names = asyncio.run(versions.display_names(["u1", "u2"]))
    assert names == {"u1": "Falcon", "u2": "Viper"}
    assert asyncio.run(versions.display_names([])) == {}
