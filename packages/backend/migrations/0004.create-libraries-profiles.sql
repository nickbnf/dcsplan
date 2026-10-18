-- Server-side theatre libraries and performance profiles for signed-in users
-- (add-library-profile-sync; AD-6 LWW, AD-13, AD-17). Rows are synced by
-- last-write-wins per entry/profile; deletes are kept as tombstones so a stale
-- offline device cannot bring them back. See the change's design.md (D1-D3).

-- One-row counter feeding every write's `seq`: the change-feed cursor source.
CREATE TABLE asset_seq (n INTEGER NOT NULL);
INSERT INTO asset_seq (n) VALUES (0);

-- A library is a container with its own id (AD-17). "One per (space, theatre)"
-- is a constraint, not part of the key, so it can be dropped later.
CREATE TABLE libraries (
    id         TEXT PRIMARY KEY,                       -- random, server-generated
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    theatre    TEXT NOT NULL,
    name       TEXT,                                   -- NULL = the theatre's default library
    parent_id  TEXT REFERENCES libraries(id),          -- reserved for a hierarchy; unused
    seq        INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (space_id, theatre)
);

-- Entry ids are client UUIDs, unique per space across all its libraries (AD-17).
CREATE TABLE library_entries (
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    id         TEXT NOT NULL,
    library_id TEXT NOT NULL REFERENCES libraries(id),
    data       TEXT,                                   -- JSON entry without id; NULL when deleted
    seq        INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,                                   -- tombstone (sync only, not a trash)
    PRIMARY KEY (space_id, id)
);
CREATE INDEX idx_library_entries_seq ON library_entries(space_id, seq);

-- Profiles: a flat list per space; client-generated ids, unique per space.
CREATE TABLE profiles (
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    id         TEXT NOT NULL,
    data       TEXT,                                   -- JSON { aircraft }; NULL when deleted
    seq        INTEGER NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (space_id, id)
);
CREATE INDEX idx_profiles_seq ON profiles(space_id, seq);
