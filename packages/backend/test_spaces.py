"""Space/membership query tests (task 2.2; spec: space — Personal space)."""
import asyncio

import pytest

import spaces
import users
from db import connect
from migrations_runner import apply_migrations


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", path)
    apply_migrations(path)
    return path


def _user(discord_id: str) -> str:
    return asyncio.run(users.upsert_user(discord_id))["id"]


def test_get_or_create_is_idempotent(db_path):
    uid = _user("d-1")
    first = asyncio.run(spaces.get_or_create_personal_space(uid))
    second = asyncio.run(spaces.get_or_create_personal_space(uid))

    assert first["id"] == second["id"]
    assert first["kind"] == "personal"

    async def counts():
        async with connect() as c:
            async with c.execute("SELECT COUNT(*) AS n FROM spaces WHERE kind='personal'") as cur:
                space_n = (await cur.fetchone())["n"]
            async with c.execute(
                "SELECT COUNT(*) AS n FROM space_members WHERE user_id=? AND role='owner'", (uid,)
            ) as cur:
                member_n = (await cur.fetchone())["n"]
            return space_n, member_n

    space_n, member_n = asyncio.run(counts())
    assert space_n == 1  # exactly one Personal space (AD-1)
    assert member_n == 1  # exactly one owner membership


def test_distinct_users_get_distinct_spaces(db_path):
    s1 = asyncio.run(spaces.get_or_create_personal_space(_user("d-1")))
    s2 = asyncio.run(spaces.get_or_create_personal_space(_user("d-2")))
    assert s1["id"] != s2["id"]


def test_get_personal_space_absent_then_present(db_path):
    uid = _user("d-1")
    assert asyncio.run(spaces.get_personal_space(uid)) is None
    created = asyncio.run(spaces.get_or_create_personal_space(uid))
    assert asyncio.run(spaces.get_personal_space(uid))["id"] == created["id"]


def test_member_role_and_user_in_space(db_path):
    uid = _user("d-1")
    sp = asyncio.run(spaces.get_or_create_personal_space(uid))
    assert asyncio.run(spaces.get_member_role(sp["id"], uid)) == "owner"
    assert asyncio.run(spaces.user_in_space(sp["id"], uid)) is True
    assert asyncio.run(spaces.user_in_space(sp["id"], "someone-else")) is False
