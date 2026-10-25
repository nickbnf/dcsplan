-- Finalized plan versions (add-version-history, design D1; AD-3, AD-5).
-- A version holds the plan's full Yjs state, independent of the update log, so
-- squashing or purging the log never touches it. `pinned` is the snapshot of the
-- library entries and profile the plan referenced at finalization (AD-3).
CREATE TABLE plan_versions (
    plan_id       TEXT NOT NULL REFERENCES plans(id),
    rev           INTEGER NOT NULL,          -- 1, 2, 3 … per plan, never reused
    finalized_at  TEXT NOT NULL,             -- UTC ISO
    editors       TEXT NOT NULL,             -- JSON [user_id, …], last editor first
    state         BLOB NOT NULL,             -- full Yjs update of the document
    content_hash  TEXT NOT NULL,             -- sha256 of the canonical flightPlan JSON
    pinned        TEXT NOT NULL,             -- JSON { entries, profile, missing }
    restored_from INTEGER,                   -- rev restored, NULL otherwise
    PRIMARY KEY (plan_id, rev)
);

-- Who has edited a plan since its latest version (design D4); consumed by the
-- next finalization.
CREATE TABLE plan_pending_editors (
    plan_id      TEXT NOT NULL REFERENCES plans(id),
    user_id      TEXT NOT NULL REFERENCES users(id),
    last_edit_at TEXT NOT NULL,
    PRIMARY KEY (plan_id, user_id)
);
