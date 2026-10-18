"""Migration 0004 structure tests (add-library-profile-sync, task 1.1): the
library/profile tables, keys, the one-library-per-theatre constraint and the
seq indexes exist; the rollback removes them."""
import sqlite3

import pytest
from yoyo import get_backend, read_migrations

from migrations_runner import MIGRATIONS_DIR, apply_migrations

NEW_TABLES = {"asset_seq", "libraries", "library_entries", "profiles"}


@pytest.fixture()
def db_path(tmp_path):
    path = str(tmp_path / "test.db")
    apply_migrations(path)
    con = sqlite3.connect(path)
    con.execute("INSERT INTO spaces (id, kind, name, created_at) VALUES ('s1','personal',NULL,'t')")
    con.execute("INSERT INTO spaces (id, kind, name, created_at) VALUES ('s2','personal',NULL,'t')")
    con.commit()
    return path


def _tables(con):
    return {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}


def test_tables_and_indexes_created(db_path):
    con = sqlite3.connect(db_path)
    assert NEW_TABLES <= _tables(con)
    idx = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert {"idx_library_entries_seq", "idx_profiles_seq"} <= idx


def test_seq_counter_starts_at_zero(db_path):
    con = sqlite3.connect(db_path)
    assert con.execute("SELECT n FROM asset_seq").fetchall() == [(0,)]


def test_one_library_per_space_and_theatre(db_path):
    con = sqlite3.connect(db_path)
    ins = "INSERT INTO libraries (id, space_id, theatre, seq, created_at) VALUES (?,?,?,1,'t')"
    con.execute(ins, ("l1", "s1", "caucasus"))
    con.execute(ins, ("l2", "s2", "caucasus"))  # other space: fine
    con.execute(ins, ("l3", "s1", "syria"))     # other theatre: fine
    with pytest.raises(sqlite3.IntegrityError):
        con.execute(ins, ("l4", "s1", "caucasus"))


def test_entry_and_profile_ids_unique_per_space(db_path):
    con = sqlite3.connect(db_path)
    con.execute("INSERT INTO libraries (id, space_id, theatre, seq, created_at) VALUES ('l1','s1','caucasus',1,'t')")
    con.execute("INSERT INTO libraries (id, space_id, theatre, seq, created_at) VALUES ('l2','s2','caucasus',1,'t')")
    ent = ("INSERT INTO library_entries (space_id, id, library_id, data, seq, updated_at) "
           "VALUES (?, 'e1', ?, '{}', 2, 't')")
    con.execute(ent, ("s1", "l1"))
    con.execute(ent, ("s2", "l2"))  # same entry id, other space
    with pytest.raises(sqlite3.IntegrityError):
        con.execute(ent, ("s1", "l1"))
    prof = "INSERT INTO profiles (space_id, id, data, seq, updated_at) VALUES (?, 'p1', '{}', 3, 't')"
    con.execute(prof, ("s1",))
    con.execute(prof, ("s2",))
    with pytest.raises(sqlite3.IntegrityError):
        con.execute(prof, ("s1",))


def test_rollback_removes_tables(tmp_path):
    path = str(tmp_path / "rb.db")
    apply_migrations(path)
    backend = get_backend(f"sqlite:///{path}")
    migrations = read_migrations(MIGRATIONS_DIR)
    with backend.lock():
        backend.rollback_migrations(
            backend.to_rollback(migrations.filter(lambda m: m.id.startswith("0004")))
        )
    con = sqlite3.connect(path)
    assert not (NEW_TABLES & _tables(con))
    assert {"spaces", "plans"} <= _tables(con)
