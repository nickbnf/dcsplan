"""Migration 0005 structure tests (add-trash-and-soft-delete, task 1.1; design
D1): `plans.purged_at` exists after migrating, and the rollback removes it."""
import sqlite3

from yoyo import get_backend, read_migrations

from migrations_runner import MIGRATIONS_DIR, apply_migrations


def _plan_columns(path):
    con = sqlite3.connect(path)
    return {r[1] for r in con.execute("PRAGMA table_info(plans)")}


def test_purged_at_column_created(tmp_path):
    path = str(tmp_path / "test.db")
    apply_migrations(path)
    assert {"deleted_at", "purged_at"} <= _plan_columns(path)


def test_rollback_removes_purged_at(tmp_path):
    path = str(tmp_path / "rb.db")
    apply_migrations(path)
    backend = get_backend(f"sqlite:///{path}")
    migrations = read_migrations(MIGRATIONS_DIR)
    with backend.lock():
        backend.rollback_migrations(
            backend.to_rollback(migrations.filter(lambda m: m.id.startswith("0005")))
        )
    columns = _plan_columns(path)
    assert "purged_at" not in columns
    assert "deleted_at" in columns
