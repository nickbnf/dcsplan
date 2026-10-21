-- Rollback for 0005.add-plan-purge.
ALTER TABLE plans DROP COLUMN purged_at;
