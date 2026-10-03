-- Create the users table: the account record persisted on first Discord sign-in (AD-13).
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    discord_id TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar TEXT,
    created_at TEXT NOT NULL
);
