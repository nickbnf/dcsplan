"""Apply yoyo migrations synchronously at startup (AD-13, D2).

Plain-SQL migrations live in ``migrations/`` and are tracked by yoyo. This runs
before the app serves requests, using yoyo's own (blocking) sqlite backend,
independent of the aiosqlite runtime path.
"""
import logging
import os

from yoyo import get_backend, read_migrations

from db import ensure_db_dir, get_db_path

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")


def apply_migrations(db_path: str | None = None) -> None:
    """Apply all pending migrations to the SQLite database."""
    path = db_path or get_db_path()
    ensure_db_dir(path)  # yoyo/sqlite will not create the parent directory
    backend = get_backend(f"sqlite:///{path}")
    migrations = read_migrations(MIGRATIONS_DIR)
    with backend.lock():
        pending = backend.to_apply(migrations)
        if pending:
            logger.info("Applying %d database migration(s)", len(pending))
        backend.apply_migrations(pending)
