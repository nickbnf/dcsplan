-- Recreate the plan tables without UNIQUE(space_id, name) (unify-plan-name, D7).
-- Plan names now live only in the synced document and need not be unique; plans
-- are told apart by their short id. DESTRUCTIVE by design: the server has never
-- been deployed, so no plan data is preserved. Spaces and memberships are kept.
DROP TABLE plan_updates;
DROP TABLE plans;

CREATE TABLE plans (
    id         TEXT PRIMARY KEY,       -- 12-char base58 id, client-generated (AD-16)
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    name       TEXT NOT NULL,          -- server-maintained copy of the document's name
    theatre    TEXT NOT NULL,          -- fixed at creation (plan-lifecycle)
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,          -- refreshed on every persisted update
    deleted_at TEXT                    -- reserved for AD-7; unused
);

CREATE TABLE plan_updates (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     TEXT NOT NULL REFERENCES plans(id),
    update_blob BLOB NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX idx_plan_updates_plan ON plan_updates(plan_id, seq);
