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


def test_unique_plan_name_per_space(db_path):
    con = sqlite3.connect(db_path)
    con.execute("INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1','personal',NULL,'t')")
    con.execute(
        "INSERT INTO plans (id, space_id, name, theatre, created_at, updated_at, deleted_at) "
        "VALUES ('p1','s1','Alpha','caucasus','t','t',NULL)"
    )
    with pytest.raises(sqlite3.IntegrityError):
        con.execute(
            "INSERT INTO plans (id, space_id, name, theatre, created_at, updated_at, deleted_at) "
            "VALUES ('p2','s1','Alpha','caucasus','t','t',NULL)"
        )
    # Same name in a different space is allowed.
    con.execute("INSERT INTO spaces (id, kind, name, created_at) VALUES ('s2','personal',NULL,'t')")
    con.execute(
        "INSERT INTO plans (id, space_id, name, theatre, created_at, updated_at, deleted_at) "
        "VALUES ('p3','s2','Alpha','caucasus','t','t',NULL)"
    )
