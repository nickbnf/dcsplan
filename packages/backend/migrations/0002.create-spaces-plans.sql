-- Create the space/plan tables: the first server-side storage of a user entity
-- (AD-1 space materialized, AD-13 SQLite). Ownership is modelled as membership
-- for every space kind, so squadrons are additive later (see AD-1's ownership
-- note). Flight-plan content is persisted as a log of Yjs updates (AD-6, AD-14).

-- The unit of ownership (AD-1). Personal now; 'squadron' kind added later.
CREATE TABLE spaces (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,          -- 'personal' | (later) 'squadron'
    name       TEXT,                   -- NULL for personal; squadron name later
    created_at TEXT NOT NULL
);

-- Ownership/membership for all spaces. A personal space has one 'owner' member.
CREATE TABLE space_members (
    space_id  TEXT NOT NULL REFERENCES spaces(id),
    user_id   TEXT NOT NULL REFERENCES users(id),
    role      TEXT NOT NULL,           -- 'owner' now; 'admin'|'member' with squadrons
    joined_at TEXT NOT NULL,           -- AD-7 seniority -> auto-promotion later
    PRIMARY KEY (space_id, user_id)
);
CREATE INDEX idx_space_members_user ON space_members(user_id);

-- The plan index. Content lives in plan_updates; this is name/theatre/metadata.
CREATE TABLE plans (
    id         TEXT PRIMARY KEY,       -- uuid, client-generated (draft -> committed)
    space_id   TEXT NOT NULL REFERENCES spaces(id),
    name       TEXT NOT NULL,
    theatre    TEXT NOT NULL,          -- fixed at creation (plan-lifecycle)
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,                   -- reserved for AD-7; unused this change
    UNIQUE(space_id, name)             -- backstops the unique-name rule (A1)
);

-- Append-only Yjs update log per plan (AD-14), periodically squashed (AD-5).
CREATE TABLE plan_updates (
    seq         INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id     TEXT NOT NULL REFERENCES plans(id),
    update_blob BLOB NOT NULL,
    created_at  TEXT NOT NULL
);
CREATE INDEX idx_plan_updates_plan ON plan_updates(plan_id, seq);
