-- Rollback for 0003.recreate-plans: restore the 0002 shape (empty tables).
DROP TABLE plan_updates;
DROP TABLE plans;

CREATE TABLE plans (
    id         TEXT PRIMARY KEY,
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    name       TEXT NOT NULL,
    theatre    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    UNIQUE(space_id, name)
);

CREATE TABLE plan_updates (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     TEXT NOT NULL REFERENCES plans(id),
    update_blob BLOB NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX idx_plan_updates_plan ON plan_updates(plan_id, seq);
