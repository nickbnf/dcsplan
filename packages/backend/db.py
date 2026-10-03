"""SQLite access for server-side state (AD-13).

Hand-written SQL over aiosqlite; no ORM. The database file location comes from
the DCSPLAN_DB_PATH environment variable, defaulting to a file alongside the
backend package. Read at call time so tests can point it at a temp file.
"""
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

import aiosqlite

# The database lives in a dedicated `data/` directory so it is easy to mount as a
# persistent volume in production (see docs/auth-and-single-origin.md).
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DEFAULT_DB_PATH = os.path.join(DATA_DIR, "dcsplan.db")


def get_db_path() -> str:
    """The SQLite file path, from DCSPLAN_DB_PATH or the package-local default."""
    return os.getenv("DCSPLAN_DB_PATH", DEFAULT_DB_PATH)


def ensure_db_dir(path: str | None = None) -> None:
    """Ensure the directory holding the database file exists."""
    parent = os.path.dirname(path or get_db_path())
    if parent:
        os.makedirs(parent, exist_ok=True)


@asynccontextmanager
async def connect(path: str | None = None) -> AsyncIterator[aiosqlite.Connection]:
    """Open an aiosqlite connection with Row access, committing on clean exit.

    Usage:
        async with connect() as db:
            async with db.execute("SELECT 1") as cur:
                await cur.fetchone()
    """
    resolved = path or get_db_path()
    ensure_db_dir(resolved)
    async with aiosqlite.connect(resolved) as conn:
        conn.row_factory = aiosqlite.Row
        yield conn
        await conn.commit()
