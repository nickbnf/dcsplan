-- Rollback for 0002.create-spaces-plans (drop in dependency order).
DROP TABLE plan_updates;
DROP TABLE plans;
DROP TABLE space_members;
DROP TABLE spaces;
