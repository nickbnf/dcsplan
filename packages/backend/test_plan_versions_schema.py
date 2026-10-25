"""Migration 0006 structure tests (add-version-history, task 2.1; design D1):
`plan_versions` and `plan_pending_editors` exist after migrating, and the
rollback removes them."""
import sqlite3

from yoyo import get_backend, read_migrations

from migrations_runner import MIGRATIONS_DIR, apply_migrations


def _tables(path):
    con = sqlite3.connect(path)
    return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}


def test_version_tables_created(tmp_path):
    path = str(tmp_path / "test.db")
    apply_migrations(path)
    assert {"plan_versions", "plan_pending_editors"} <= _tables(path)


def test_rollback_removes_version_tables(tmp_path):
    path = str(tmp_path / "rb.db")
    apply_migrations(path)
    backend = get_backend(f"sqlite:///{path}")
    migrations = read_migrations(MIGRATIONS_DIR)
    with backend.lock():
        backend.rollback_migrations(
            backend.to_rollback(migrations.filter(lambda m: m.id.startswith("0006")))
        )
    tables = _tables(path)
    assert not {"plan_versions", "plan_pending_editors"} & tables
    assert "plans" in tables
