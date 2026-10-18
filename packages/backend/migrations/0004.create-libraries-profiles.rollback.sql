-- Rollback for 0004.create-libraries-profiles (drop in dependency order).
DROP TABLE profiles;
DROP TABLE library_entries;
DROP TABLE libraries;
DROP TABLE asset_seq;
