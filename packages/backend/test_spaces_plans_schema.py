"""Migration 0002 structure tests (tasks 2.1): the space/plan tables, indexes,
and the unique-name constraint exist after migrating a fresh database."""
import sqlite3

import pytest

from migrations_runner import apply_migrations


@pytest.fixture()
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    apply_migrations(path)
    return path


def test_tables_created(db_path):
    con = sqlite3.connect(db_path)
    names = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"spaces", "space_members", "plans", "plan_updates"} <= names


def test_indexes_created(db_path):
    con = sqlite3.connect(db_path)
    idx = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert "idx_space_members_user" in idx
    assert "idx_plan_updates_plan" in idx


def test_same_plan_name_allowed_in_one_space(db_path):
    """0003 drops UNIQUE(space_id, name): duplicate names coexist (unify-plan-name)."""
    con = sqlite3.connect(db_path)
    con.execute("INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1','personal',NULL,'t')")
    for pid in ("p1", "p2"):
        con.execute(
            "INSERT INTO plans (id, space_id, name, theatre, created_at, updated_at, deleted_at) "
            "VALUES (?,'s1','Alpha','caucasus','t','t',NULL)", (pid,)
        )
    assert con.execute("SELECT COUNT(*) FROM plans WHERE name='Alpha'").fetchone()[0] == 2


def test_0003_keeps_spaces_and_memberships(tmp_path):
    """0003 recreates plan tables only; spaces and memberships survive."""
    from yoyo import get_backend, read_migrations
    from migrations_runner import MIGRATIONS_DIR

    path = str(tmp_path / "staged.db")
    backend = get_backend(f"sqlite:///{path}")
    migrations = read_migrations(MIGRATIONS_DIR)
    before = migrations.filter(lambda m: not m.id.startswith("0003"))
    with backend.lock():
        backend.apply_migrations(backend.to_apply(before))

    con = sqlite3.connect(path)
    con.execute("INSERT INTO users (id, discord_id, created_at) VALUES ('u1','d1','t')")
    con.execute("INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1','personal',NULL,'t')")
    con.execute("INSERT INTO space_members (space_id, user_id, role, joined_at) VALUES ('s1','u1','owner','t')")
    con.execute(
        "INSERT INTO plans (id, space_id, name, theatre, created_at, updated_at) "
        "VALUES ('p1','s1','Alpha','caucasus','t','t')"
    )
    con.commit()
    con.close()

    with backend.lock():
        backend.apply_migrations(backend.to_apply(read_migrations(MIGRATIONS_DIR)))

    con = sqlite3.connect(path)
    assert con.execute("SELECT COUNT(*) FROM spaces").fetchone()[0] == 1
    assert con.execute("SELECT COUNT(*) FROM space_members").fetchone()[0] == 1
    assert con.execute("SELECT COUNT(*) FROM plans").fetchone()[0] == 0  # destructive by design
