# Design

## Context

See `proposal.md` — Why. This change adds Discord-based identity and introduces the **first stateful backend** in a project whose FastAPI service is stateless today (kneeboard generation, tiles, import validation).

Constraints that shape the approach, from the current codebase:

- **Frontend and backend are two separate services**, fronted in prod by an existing **Caddy reverse proxy** on two subdomains: `dcsplan.bonnefon.org` → frontend (`:5000`) and `api.dcsplan.bonnefon.org` → backend (`:5001`). The frontend reaches the backend via `API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'` (`packages/frontend/src/config/api.ts`). `main.py` currently runs `CORSMiddleware` from `CORS_ORIGINS` (default `http://localhost:5173`) with `allow_credentials=True`.
- Because a reverse proxy already exists, this change **consolidates the two services behind a single origin** (see D6), which removes CORS and any cross-origin cookie reasoning from the auth path.
- **No datastore, ORM, or auth libraries exist yet.** `httpx` and `python-dotenv` are already dependencies.
- Data stays local (AD-9); this change does not persist the three entities. The only thing that becomes server-side state is the **user record**.

## Goals / Non-Goals

**Goals:**
- A user can sign in with Discord, sign out, and have an account (a persisted user record) created on first sign-in.
- The backend can answer "who is the current user?" on any request.
- Establish the datastore + migration + async-access pattern that later stateful changes (squadrons, then server storage of the three entities) will reuse.

**Non-Goals (design-level; see proposal for scope non-goals):**
- No collapsing of the two *services* — they still run as separate processes; only the public *origin* is unified, via a Caddy path rule (D6).
- No revocable/server-side sessions yet — signed-cookie sessions only (upgrade path noted).
- No abstraction layer over the DB beyond a thin query module — no ORM, no repository framework.

## Decisions

### D1 — Datastore: SQLite, hand-written SQL, no ORM
Persist the user record in **SQLite**, accessed with **hand-written SQL** (no ORM). The schema is tiny and the query surface is small; an ORM's mapping layer and "magic" buy little here and add indirection.

- **Runtime access: `aiosqlite`.** The OAuth callback handler is `async` (it `await`s `httpx-oauth` calls to Discord), and a blocking `sqlite3` call inside an async handler would stall the event loop. `aiosqlite` keeps DB calls `await`-able and non-blocking, without the `def`-handler / `asyncio.to_thread` workarounds.
- *Alternatives considered:* **ORM (SQLAlchemy/SQLModel)** — rejected for the "no magic" reason above and because it isn't needed at this scale. **Postgres** — rejected for now; SQLite is zero-infra and sufficient for a user table (see D-cross-capability note). **Plain `sqlite3` + `asyncio.to_thread`** — viable, no extra dep, but pushes an offload wrapper to every call site; `aiosqlite` is cleaner given the async handlers.

> **Cross-capability note:** this datastore choice is precedent for *every* later stateful change and is recorded as **AD-13** in `docs/architecture/centralized-flightplans.md`. D1/D2 here are its change-local application (user table, first migration).

### D2 — Migrations: `yoyo-migrations`, plain `.sql`, run at startup
Schema evolves through **`yoyo-migrations`**: ordered plain-SQL files (e.g. `migrations/0001.create-users.sql`, with optional `.rollback.sql`), tracked in yoyo's own table. Migrations are applied **synchronously at application startup**, before serving requests, using yoyo's own (blocking) backend — independent of the `aiosqlite` runtime path.

- *Alternatives considered:* **`PRAGMA user_version` hand-rolled runner** — zero deps but no built-in rollback/tracking; yoyo gives ordering, tracking, transactions, and rollback for one small dependency while staying plain-SQL. **Alembic** — tied to SQLAlchemy, over-heavy, and reintroduces the ORM ecosystem we're avoiding.

### D3 — OAuth handshake: `httpx-oauth` (`DiscordOAuth2`)
Use **`httpx-oauth`**'s `DiscordOAuth2` client for the authorization-URL construction and code→token exchange (async, httpx-based, one small dep). Discord is plain OAuth2 (no OIDC discovery, no `id_token`), so the library's job is just to remove the endpoint/token-exchange boilerplate; we retain control of `state`, the session, and the profile fetch. Scope: `identify`.

- *Alternatives considered:* **Hand-rolled with `httpx`** — no new dep, but re-implements what `httpx-oauth` already does correctly; marginal savings. **Authlib** — built primarily for OIDC; for Discord you configure endpoints manually and its extras go unused; "most magic" of the viable options. **fastapi-users** — rejected: it is ORM-oriented (SQLAlchemy/Beanie adapters), directly conflicting with D1, and brings far more than single-provider login. **Hosted IdP** — rejected: external dependency/cost, against the self-hosted spirit (AD-11 is Discord-only anyway).

### D4 — CSRF `state`: single-use, in the signed session cookie
`httpx-oauth` does not persist `state`. Before redirecting to Discord, generate `state = secrets.token_urlsafe(32)` and store it in the signed session cookie. On callback, `pop` it (single-use), compare with `secrets.compare_digest`, and reject on mismatch/absence. `Lax` cookies are sent on the top-level GET navigation Discord uses for the callback, so the stored `state` is present. No PKCE (Discord is a confidential client holding the secret).

### D5 — Session: signed cookie via Starlette `SessionMiddleware`
"Who is logged in" is **not** provided by the OAuth library. Use Starlette's `SessionMiddleware` (ships with FastAPI — no new dep): a signed cookie holding `user_id`. After a successful handshake and user upsert, set `request.session["user_id"] = user.id`. A `get_current_user` dependency reads it and loads the user via `aiosqlite`. Logout = `request.session.clear()`.

- Cookie attributes: **`HttpOnly; Secure; SameSite=Lax`**, host-only on the single origin (`dcsplan.bonnefon.org`) — same-origin, so it is sent on every SPA→`/api` request by default (D6).
- *Alternatives considered:* **Opaque session id + `sessions` table** — enables server-side revocation ("sign out everywhere", useful for shared simulator PCs), at the cost of a table and a per-request lookup. Deferred until revocation is actually needed; the switch is localized to the session layer. **Stateless JWT** — same statelessness as the signed cookie but harder to revoke and no real advantage here.

### D6 — Single origin: route the API under the frontend host via Caddy; no CORS
Serve frontend and backend under **one origin**. The existing Caddy proxy gains a path rule on `dcsplan.bonnefon.org`: `/api/*` → backend (`:5001`, prefix stripped), everything else → frontend (`:5000`):

```caddy
dcsplan.bonnefon.org {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy localhost:5001
    }
    handle {
        reverse_proxy localhost:5000
    }
}
```

The `api.dcsplan.bonnefon.org` host becomes redundant and can be retired. The SPA calls a **relative `/api` base**, so every request is same-origin: **CORS is eliminated**, and the auth cookie is a plain same-origin `HttpOnly; Secure; SameSite=Lax` with no cross-site exposure now or if the domain layout ever changes.

- **Frontend:** `API_URL` becomes the relative `/api`; a **Vite dev proxy** (`vite.config.ts`) mirrors the prod rule (`/api` → the backend dev port). This is centralised in `config/api.ts` + `vite.config.ts`; call sites (`getApiUrl`, the tile-layer URL) are unchanged.
- **Same-origin means cookies are sent by default** — no `credentials: 'include'` needed.
- **Prefix wrinkle:** the backend serves routes at the root today (`/kneeboard`, `/tiles`, `/theatres`, and a pre-existing `@app.get("/api")`). Caddy strips the `/api` prefix so those keep working unchanged; the old `@app.get("/api")` route would land at `/api/api` — rename or drop it to avoid confusion.
- The existing `CORSMiddleware` is removed (all traffic is same-origin).
- *Alternative considered:* **keep two subdomains** with `SameSite=Lax` cross-origin cookies + the existing CORS — works (same-site) with zero infra change, but retains CORS and cross-origin cookie reasoning. Superseded here in favour of the simpler single-origin model, which is cheap now that a reverse proxy already exists. **Cross-*site* `SameSite=None; Secure`** — never needed; the services are not on unrelated domains.

### D7 — User record shape
Minimal, hand-written schema:
- `id` — internal UUID, primary key (stable app identity, decoupled from Discord).
- `discord_id` — unique, the external identity key used for upsert on login.
- `display_name`, `avatar` — cached from the Discord `identify` profile for UI; refreshed on login.
- `created_at` — timestamp.

A `personal_space_id` (AD-1) is intentionally omitted until spaces are materialized.

### D8 — Frontend auth surface
A new auth context (alongside `FlightPlanContext`, `LibraryContext`, `PerformanceContext`) exposes session state (anonymous vs signed-in + the current user) and `login()` / `logout()` actions, backed by backend endpoints (initiate login, callback, "who am I", logout) reached via the relative `/api` base (D6). Login/logout entry points live in the app header. No existing data context changes — the data model is untouched (AD-9). Logout does **not** clear local data (no server copy exists to fall back on).

## Risks / Trade-offs

- **Signed-cookie sessions can't be revoked before expiry** → Accepted for now; a copied cookie stays valid until it expires. Mitigate with a modest session lifetime; upgrade to a server-side `sessions` table (D5 alternative) when remote logout is needed. The change is contained to the session layer.
- **First stateful backend adds deployment requirements** (persistent volume for the SQLite file, new secrets: Discord client id/secret, session-signing key, redirect URI) → Document env/config; a lost SQLite file loses only user rows (no user *data* is stored yet), so early-stage blast radius is small.
- **`state` lives in the session cookie** → If a user starts login in two tabs, the second overwrites the first's `state`, failing the first callback. Acceptable (rare, user simply retries); a keyed map could be added if it proves annoying.
- **Discord outage / changed endpoints** → `httpx-oauth` tracks Discord's endpoints; failures surface as a clean login error, and the anonymous tier keeps working (AD-9) so the app is never blocked by auth being down.
- **Single-origin migration touches all API calls, not just auth** → moving `API_URL` to the relative `/api` reroutes every existing call (kneeboard, tiles, theatres) through the new Caddy path. Mitigate: the base is centralised in `config/api.ts` + `vite.config.ts`, and the Caddy prefix-strip keeps backend paths unchanged; verify tiles/kneeboard still resolve after the switch. Retiring `api.dcsplan.bonnefon.org` and dropping CORS should be coordinated with the deploy so no client is left pointing at the old host.

## Migration Plan

1. Add backend deps (`aiosqlite`, `yoyo-migrations`, `httpx-oauth`) to the backend venv/requirements.
2. Add config/secrets (Discord client id/secret, redirect URI, session-signing key) via env (`python-dotenv`).
3. Add the `migrations/` dir + first migration (create `users`); run yoyo at startup.
4. Add OAuth + session routes and the `get_current_user` dependency; add `SessionMiddleware`; remove `CORSMiddleware`.
5. Switch to single origin (D6): add the Caddy `/api/*` path rule (prefix-stripped) on `dcsplan.bonnefon.org` and a matching Vite dev proxy; point `API_URL` at the relative `/api`; rename/drop the old `@app.get("/api")` route.
6. Add the frontend auth context + header login/logout.
7. Register the Discord application + redirect URI(s) (dev + `https://dcsplan.bonnefon.org/api/...`).

**Rollback:** the feature is additive. If disabled, the anonymous tier is unaffected (AD-9); yoyo `rollback` drops the `users` table. No existing behaviour depends on auth.

## Open Questions

- **Session lifetime / "remember me"** — exact cookie max-age can be tuned later without affecting specs or tasks.
