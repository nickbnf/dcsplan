# Tasks

## 1. Backend datastore scaffolding (AD-13, D1/D2)

- [x] 1.1 Add `aiosqlite`, `yoyo-migrations`, `httpx-oauth` to the backend requirements and install into the project venv; verify each imports (`python -c "import aiosqlite, yoyo, httpx_oauth"`) with no error.
- [x] 1.2 Add a DB-path config value and an `aiosqlite` connection helper (single source of the DB file location); verify a smoke test opens a connection and runs `SELECT 1`.
- [x] 1.3 Add a `yoyo` migration runner that applies `migrations/` synchronously at app startup; verify that starting the app against a fresh DB creates yoyo's tracking table (`_yoyo_migration`) and exits 0.

## 2. User record + queries (spec: Account creation on first sign-in)

- [x] 2.1 Add `migrations/0001.create-users.sql` (+ rollback) creating `users` (`id` UUID PK, `discord_id` UNIQUE, `display_name`, `avatar`, `created_at`); verify `yoyo apply` then `yoyo rollback` succeed and the applied table has the expected columns.
- [x] 2.2 Add a hand-written SQL query module (`get_user_by_id`, `get_user_by_discord_id`, `upsert_user`) over `aiosqlite`; verify pytest (in-memory SQLite) covers first-login creates a row and a returning `discord_id` reuses it with **no duplicate**.

## 3. Config & Discord application (D3)

- [x] 3.1 Load auth config from env via `python-dotenv` (Discord client id/secret, redirect URI, session-signing secret); verify the app fails fast with a clear message when a required var is missing (pytest asserting the startup error) and document the variables in `docs/`.
- [ ] 3.2 (needs you — external) Register the Discord application and set its redirect URIs (dev + `https://dcsplan.bonnefon.org/api/auth/discord/callback`); verify the Discord authorize URL for the configured client id renders the consent screen (manual, recorded in the doc from 3.1).

## 4. OAuth + session endpoints (D4/D5; specs: Sign in, Persistent session, Log out, Reject unverified callbacks, Cancelled/failed authorization)

- [x] 4.1 Add Starlette `SessionMiddleware` with a signed `HttpOnly; Secure; SameSite=Lax` cookie; verify a test can set and read `request.session`.
- [x] 4.2 Add the login-initiation route: generate `state` (`secrets.token_urlsafe`), store it in the session, build the Discord authorize URL (`httpx-oauth` `DiscordOAuth2`, scope `identify`) and redirect; verify a test asserts the redirect targets Discord's authorize URL and `state` is persisted in the session.
- [x] 4.3 Add the callback route: `pop` + `compare_digest` the `state` (reject on mismatch/absence without a session), exchange the code, fetch `/users/@me`, upsert the user, set `session["user_id"]`, redirect to the app; verify pytest with mocked Discord token/profile covers **success** (account created, session set) and **state mismatch → rejected, no session** (spec: Sign in, Account creation, Reject unverified callbacks).
- [x] 4.4 Handle Discord returning an error / user cancellation on the callback: leave the user anonymous with no account change; verify a test asserts anonymous state and no new user row (spec: Cancelled or failed authorization).
- [x] 4.5 Add the "current user" route + `get_current_user` dependency: returns the user's identity (display name/avatar) when signed in, anonymous otherwise; verify tests for both states (spec: Persistent signed-in session).
- [x] 4.6 Add the logout route (`request.session.clear()`); verify a test that the session is cleared and a subsequent "current user" call reports anonymous (spec: Log out — backend side).

## 5. Single-origin cutover (D6)

- [x] 5.1 Remove `CORSMiddleware` from `main.py` and rename/drop the pre-existing `@app.get("/api")` route (avoids the `/api/api` collision after prefix-strip); verify the existing backend test suite still passes and no two routes collide.
- [x] 5.2 Point the frontend `API_URL` at the relative `/api` and add a Vite dev proxy (`/api` → backend dev port) in `vite.config.ts`; verify in `pnpm dev` that kneeboard/tiles/theatres requests resolve through `/api` and the map + generate flow still work.
- [ ] 5.3 (needs you — server deploy) Update Caddy: on `dcsplan.bonnefon.org` add `handle /api/* { uri strip_prefix /api; reverse_proxy localhost:5001 }` with a default `handle` to `:5000`, and retire the `api.dcsplan.bonnefon.org` host; verify on deploy that `https://dcsplan.bonnefon.org/api/theatres` reaches the backend and the SPA loads, and record the Caddy block in `docs/`.

## 6. Frontend auth surface (D8; specs: Persistent session, Log out, Anonymous tier)

- [x] 6.1 Add an auth context that resolves session state (anonymous vs signed-in + current user) from the "current user" endpoint on load; verify a vitest test with mocked fetch renders both signed-in and anonymous states.
- [x] 6.2 Wire `login()` (navigate to the backend login route) and `logout()` (call the logout route, return to anonymous); verify a vitest test asserts logout returns to anonymous and leaves the local flight plan / library / performance stores untouched (spec: Log out).
- [x] 6.3 Add header login/logout UI — "Sign in with Discord" when anonymous, display name/avatar + logout when signed in; verify a component test renders each state.

## 7. Integration verification

- [ ] 7.1 (needs you — live Discord run) Run the full sign-in flow in dev (single origin via the Vite proxy) against a real Discord dev app: sign in creates an account, a reload stays signed in, logout returns to anonymous with local data intact; verify by following the doc from 3.1.
- [x] 7.2 Verify the anonymous tier is unaffected (AD-9): full plan/library/profile use with no sign-in, and signing in neither moves nor alters local data nor unlocks server-backed behaviour (spec: Anonymous tier remains fully functional).
