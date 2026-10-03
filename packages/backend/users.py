"""User account queries (hand-written SQL, no ORM — AD-13).

The account record persisted on first Discord sign-in. `upsert_user` creates a
row the first time a Discord identity is seen and reuses it (refreshing cached
profile fields) on every subsequent sign-in.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiosqlite

from db import connect


def _to_dict(row: Optional[aiosqlite.Row]) -> Optional[dict]:
    return dict(row) if row is not None else None


async def get_user_by_id(user_id: str) -> Optional[dict]:
    async with connect() as db:
        async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cur:
            return _to_dict(await cur.fetchone())


async def get_user_by_discord_id(discord_id: str) -> Optional[dict]:
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM users WHERE discord_id = ?", (discord_id,)
        ) as cur:
            return _to_dict(await cur.fetchone())


async def upsert_user(
    discord_id: str,
    display_name: Optional[str] = None,
    avatar: Optional[str] = None,
) -> dict:
    """Create the account on first sign-in; reuse (and refresh) it thereafter.

    Returns the account row as a dict. Never creates a duplicate for a
    discord_id that already has an account.
    """
    async with connect() as db:
        async with db.execute(
            "SELECT * FROM users WHERE discord_id = ?", (discord_id,)
        ) as cur:
            existing = await cur.fetchone()

        if existing is not None:
            await db.execute(
                "UPDATE users SET display_name = ?, avatar = ? WHERE discord_id = ?",
                (display_name, avatar, discord_id),
            )
            async with db.execute(
                "SELECT * FROM users WHERE discord_id = ?", (discord_id,)
            ) as cur:
                return _to_dict(await cur.fetchone())

        user = {
            "id": uuid.uuid4().hex,
            "discord_id": discord_id,
            "display_name": display_name,
            "avatar": avatar,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.execute(
            "INSERT INTO users (id, discord_id, display_name, avatar, created_at) "
            "VALUES (:id, :discord_id, :display_name, :avatar, :created_at)",
            user,
        )
        return user
