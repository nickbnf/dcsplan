# Proposal

## Why

`add-user-accounts` gave the app an identity but deliberately left all three entities on-device — nothing a signed-in user does yet reaches the server. This change makes the **flight plan** the first entity to live server-side: a signed-in user's plans persist in their Personal space and sync across their devices (and, later, between squadron members) over the Yjs transport the client was prepared for in `add-yjs-flightplan` (AD-6). It is scoped to **plans only** — library and profile sync follow in a separate change — to keep the first server-storage change reviewable.

## What Changes

- **Personal space is materialized (AD-1).** `add-user-accounts` persisted only a user record; this change gives each account exactly one Personal space, created on first need. Every server-synced plan belongs to it.
- **The signed-in tier holds many plans in the Personal space.** The user can list the space's plans, select the active one, and rename a plan. (Plan *creation* and theatre binding are already specified in `plan-lifecycle`, both tiers — unchanged here.)
- **Flight-plan sync over the Yjs WebSocket transport (AD-6).** Signing in attaches a WebSocket provider to the *existing* local Y.Doc — same document, new transport, no data conversion. The server persists **Y.Doc state**, not serialized JSON.
- **Autosave becomes server persistence for signed-in plans (AD-5).** The working copy is continuously persisted; this change creates **no version snapshots** (finalized versions and restore are deferred to `add-version-history`).
- **New architecture decision — AD-14:** the Yjs sync socket is served by **FastAPI via `pycrdt`**, with Y.Doc state persisted to SQLite (AD-13) and room access authorized by the existing session cookie. No second service; the single-origin Caddy setup is unchanged. Recorded in `docs/architecture/centralized-flightplans.md`.
- **The connectivity axis is honored.** A signed-in but disconnected user keeps editing locally (IndexedDB); edits converge automatically on reconnect (CRDT merge). This is distinct from the anonymous tier (AD-9).
- **Wire-format reshape (AD-2).** The lingering v1.4 coupling — the backend expecting `aircraft` nested inside `flightPlan`, marshalled in/out on import and kneeboard generation (`flight_plan.py`) — is cleaned up here, where the plan wire format is already being reshaped for sync. **BREAKING (wire format)** at the backend boundary.
- **The anonymous tier is unchanged (AD-9):** local Y.Doc + IndexedDB, no provider, a single plan.

## Capabilities

### New Capabilities

- `space`: The Personal space as the unit of ownership (AD-1) — one per account, materialized server-side — and the signed-in tier's container of flight plans: listing the space's plans, selecting the active plan, and renaming a plan. The anonymous tier is space-less. (Scoping of theatre libraries and performance profiles to the space is deferred with their sync.)
- `plan-sync`: How a flight plan's state persists and propagates — server autosave of the working copy (AD-5), the Yjs WebSocket transport and server-side Y.Doc persistence (AD-6, AD-14), convergence across a user's devices, and behavior across the connectivity axis (connected vs disconnected). Stated for both tiers: anonymous is local-only (no sync), signed-in syncs.

### Modified Capabilities

- `plan-lifecycle`: The signed-in creation behavior is clarified for defer-commit (AD-15) — a newly created signed-in plan is a **draft** that joins the space's plans only on its first waypoint, and an abandoned empty draft adds nothing. The "no existing plan is discarded" guarantee is unchanged; only the timing of when the new plan joins the space is made explicit. (The other `plan-lifecycle` requirements — theatre binding, confirmation, library-on-create — are unchanged.)

## Impact

**Backend (`packages/backend`).**
- New persistence (yoyo migration, AD-13): a `spaces` table (one Personal space per user) and a `plans` index table (`id`, `space_id`, `name`, `updated_at`, soft-delete column reserved but unused here), plus a table holding each plan's Y.Doc state (append-with-periodic-squash).
- New plan-index REST endpoints scoped to the session's space: list, create, rename. (No delete — see Non-goals.)
- New WebSocket route (e.g. `/api/sync/{planId}`) served via `pycrdt`, authorized by the session cookie against the owning space.
- Wire-format reshape in `flight_plan.py`: `aircraft` un-nested from the `FlightPlan` request model and the kneeboard/import marshalling that currently reads `flightPlan.aircraft.*`.
- New dependency: `pycrdt` (and possibly `pycrdt-websocket`, decided in design).

**Frontend (`packages/frontend`).**
- A WebSocket provider (`y-websocket`) attached to the flight-plan Y.Doc when signed-in, removed on logout; the anonymous local-only path is untouched. The existing auth context supplies session state.
- New UI: a plan list, active-plan selection, and rename, for the signed-in tier.
- A REST client for the plan index.
- New dependency: `y-websocket`.

**Infrastructure.**
- The dev Vite proxy and prod Caddy already route `/api/*` to the backend, but the WebSocket upgrade must be allowed to pass through (the dev proxy needs `ws: true`; verify the Caddy `reverse_proxy` handles the upgrade).

## Non-goals

- **Library and profile server sync.** They remain React state + localStorage (AD-6: LWW for those, later). A synced plan's library *references* travel in the Y.Doc, but on a device lacking those library objects they render as the existing **missing-object placeholder** (AD-4/AD-7 pattern) until library sync lands.
- **Local-data import on sign-in (AD-8).** Deferred to `add-local-data-import`. A newly signed-in user's existing local anonymous plan is **not** auto-migrated into the account here.
- **Device wipe on logout.** Tied to migration/import; deferred with `add-local-data-import`. Local data is preserved on logout, as in `add-user-accounts`.
- **Version history, finalized versions, and restore (AD-3, AD-4, AD-5 snapshots).** This change does autosave persistence only; `add-version-history` adds versioning.
- **Plan deletion and trash (AD-7).** Deferred to `add-trash-and-soft-delete`. Rename/list/select are in scope; deletion (hard or soft) is not.
- **Sharing (AD-10), squadron (multi-member) spaces, and presence/cursors (Yjs awareness protocol).** All later changes.
