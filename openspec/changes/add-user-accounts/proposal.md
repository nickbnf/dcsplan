# Proposal

## Why

The centralized-flight-plans programme needs an identity before it can have anything account-backed: cloud sync, versioning, and sharing all presume "whose is this?". `plan-lifecycle` already speaks of a **signed-in** tier, but nothing in the app lets a user actually sign in. This change adds that identity — Discord OAuth login, logout, and account creation — as the foundation the later storage and sync changes hang off of. It deliberately stops at identity: no user data moves to the server yet.

## What Changes

- **Discord OAuth login.** A user can sign in with Discord. The FastAPI backend performs the authorization-code exchange (holding the client secret) and issues a session to the browser. Per AD-11, Discord is the only provider.
- **Account creation on first login.** The first time a Discord identity signs in, the backend creates and persists a **minimal user record** (keyed on the Discord user id). This introduces the **first stateful backend** — the backend is stateless today. This user record is the account entity that a Personal space (AD-1) will later be attached to; the space itself is *not* materialized here.
- **Logout.** A user can end their session. Local data (plan, library, profile) is **preserved** — nothing is synced to the server yet, so wiping the device would destroy the user's only copy. The product brief's "clear device on logout" behaviour is deferred until sync exists.
- **Auth-aware frontend.** The app gains a notion of the current session (signed-in vs anonymous) and UI entry points to log in and log out. Being signed in does **not** yet change where data lives or unlock the signed-in-tier behaviours in `plan-lifecycle` — those arrive with server storage.
- **Data location is unchanged.** All three entities (flight plans, per-theatre libraries, performance profiles) continue to live on the front-end exactly as in the anonymous tier (AD-9), whether or not the user is signed in.

## Capabilities

### New Capabilities
- `user-identity`: How a user authenticates with the app — Discord OAuth login, account creation (a persisted user record) on first sign-in, session lifetime, logout, and the anonymous-vs-signed-in distinction as it applies to identity (not to data storage). Covers AD-9 (anonymous stays a first-class tier) and AD-11 (Discord-only) on the identity axis.

### Modified Capabilities
<!-- None. `plan-lifecycle` already references the signed-in tier, but its behaviour
     (multiple plans, space-scoped libraries) does not change here — being signed in
     does not yet alter data storage. Space materialization (AD-1) and local-data
     migration (AD-8) are deferred to the later storage/sync change. -->
- None.

## Impact

**Backend (`packages/backend`) — first stateful layer.**
- New persistence: a datastore for user records (schema/migration management, choice of DB). None exists today.
- New OAuth + session routes: initiate Discord login, handle the OAuth callback / code exchange, establish and clear the session, and expose the current user ("who am I").
- New configuration/secrets: Discord client id + secret, OAuth redirect URI, and a session-signing secret — new deployment/env requirements.
- New dependencies (exact choices for design.md): an OAuth/HTTP client (`httpx` is already present), a session/token mechanism, and a DB driver/ORM.

**Frontend (`packages/frontend`).**
- A new auth context exposing session state (anonymous vs signed-in) and login/logout actions, alongside the existing contexts.
- Login/logout UI entry points in the app header.
- No change to `FlightPlanContext`, `LibraryContext`, or `PerformanceContext` — the data model is untouched.

**Non-goals**
- **No squadrons.** Multi-user spaces come in a later change.
- **No server-side storage of the three entities.** Plans, libraries, and profiles stay local (AD-9); server storage/sync is deferred to `add-cloud-sync`.
- **No Personal space materialization (AD-1)** beyond persisting the user record — a space with no stored entities has no behaviour to specify yet.
- **No local-data migration into an account (AD-8)** — deferred to `add-local-data-import`.
- **No signed-in-tier data behaviour** (multiple plans, space-scoped libraries) — `plan-lifecycle` is unchanged here.
- **No device wipe on logout** — deferred until a server copy exists.
- **No other OAuth providers, and no account merge/recovery** (AD-11).
