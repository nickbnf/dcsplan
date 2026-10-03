"""Tests for the user account query module (spec: Account creation on first sign-in)."""
import asyncio

import pytest

import users
from migrations_runner import apply_migrations


@pytest.fixture()
def db_path(tmp_path, monkeypatch):
    path = str(tmp_path / "test.db")
    monkeypatch.setenv("DCSPLAN_DB_PATH", path)
    apply_migrations(path)
    return path


def test_first_login_creates_account(db_path):
    user = asyncio.run(users.upsert_user("discord-123", "Falcon", "avatar-hash"))
    assert user["discord_id"] == "discord-123"
    assert user["display_name"] == "Falcon"
    assert user["id"]  # a generated internal id
    assert user["created_at"]

    fetched = asyncio.run(users.get_user_by_id(user["id"]))
    assert fetched == user


def test_returning_login_reuses_account_no_duplicate(db_path):
    first = asyncio.run(users.upsert_user("discord-123", "Falcon", "hash-1"))
    # Same discord identity signs in again, with a refreshed profile.
    second = asyncio.run(users.upsert_user("discord-123", "Falcon-Renamed", "hash-2"))

    assert second["id"] == first["id"]  # same account
    assert second["display_name"] == "Falcon-Renamed"  # profile refreshed
    assert second["avatar"] == "hash-2"

    # Exactly one row for this discord_id.
    async def count():
        from db import connect

        async with connect() as conn:
            async with conn.execute(
                "SELECT COUNT(*) AS n FROM users WHERE discord_id = ?", ("discord-123",)
            ) as cur:
                return (await cur.fetchone())["n"]

    assert asyncio.run(count()) == 1


def test_lookup_by_discord_id(db_path):
    created = asyncio.run(users.upsert_user("discord-999"))
    found = asyncio.run(users.get_user_by_discord_id("discord-999"))
    assert found["id"] == created["id"]
    assert asyncio.run(users.get_user_by_discord_id("nope")) is None
