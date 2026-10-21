-- Trash and purge for plans (add-trash-and-soft-delete, design D1; AD-7).
-- A trashed plan has `deleted_at` set; a purged one also has `purged_at` set and
-- no update log. The row is kept so a purged id can never be registered again.
-- Entries and profiles need no column: a tombstone with data is trashed, one
-- without data (including every tombstone written before this change) is purged.
ALTER TABLE plans ADD COLUMN purged_at TEXT;
