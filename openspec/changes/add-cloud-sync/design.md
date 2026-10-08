# Design

## Context

`add-cloud-sync` is the first change to put a user entity — the flight plan — on the server. It builds on `add-user-accounts` (Discord identity, the first stateful backend: SQLite + `yoyo` + `aiosqlite`, AD-13) and on `add-yjs-flightplan` (the flight plan is already a local Y.Doc + IndexedDB, no network). Scope is **plan-sync-first**: Personal space, multiple plans, Yjs plan sync, the AD-2 wire-format reshape. Library and profile sync, local-data import, versioning, deletion, and sharing are non-goals (see `proposal.md`).

Decisions that span the programme are recorded as ADs and cited here, not restated:

- **AD-1** — space is the unit of ownership; opening a plan implies its space.
- **AD-5** — autosave persists the working copy but creates no version.
- **AD-6** — the flight plan is a Y.Doc; the server persists Y.Doc state, not JSON.
- **AD-13** — server state is SQLite, hand-written SQL, `yoyo` migrations, `aiosqlite`.
- **AD-14** — the sync socket is served by FastAPI via `pycrdt`; one Y.Doc per plan; room = `planId`.
- **AD-15** — selection is a space→plan hierarchy chosen on a Home screen; state is `(activeSpaceId, activePlanId)`; a created plan is a local draft until its first waypoint.

This document records only what is local to this change: the SQLite schema, the REST and WebSocket surface, the wire-format reshape, the client multi-doc and draft lifecycle, and the UX specifics.

## Data model (SQLite, new `yoyo` migration)

Four new tables alongside the AD-13 `users` table. Ids are client-generatable UUID strings (see draft lifecycle).

**Ownership is modelled as membership for *all* spaces** (see AD-1's ownership note), so squadrons are purely additive later — no `spaces` rebuild. A Personal space is a `spaces` row plus exactly one `space_members` row (`role='owner'`); a squadron space (later) is the same shape with many members and richer roles.

```sql
CREATE TABLE spaces (
  id         TEXT PRIMARY KEY,               -- uuid
  kind       TEXT NOT NULL,                  -- 'personal' | (later) 'squadron'
  name       TEXT,                           -- NULL for personal; squadron name later
  created_at TEXT NOT NULL
);

CREATE TABLE space_members (
  space_id  TEXT NOT NULL REFERENCES spaces(id),
  user_id   TEXT NOT NULL REFERENCES users(id),
  role      TEXT NOT NULL,                   -- 'owner' this change; 'admin'|'member' with squadrons
  joined_at TEXT NOT NULL,                   -- AD-7 seniority → auto-promotion later
  PRIMARY KEY (space_id, user_id)
);
CREATE INDEX idx_space_members_user ON space_members(user_id);

CREATE TABLE plans (
  id         TEXT PRIMARY KEY,               -- uuid, client-generated (draft → committed)
  space_id   TEXT NOT NULL REFERENCES spaces(id),
  name       TEXT NOT NULL,
  theatre    TEXT NOT NULL,                  -- fixed at creation (plan-lifecycle)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,                           -- reserved for AD-7; unused this change
  UNIQUE(space_id, name)                     -- backstops the A1 rename rule
);

CREATE TABLE plan_updates (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id    TEXT NOT NULL REFERENCES plans(id),
  update_blob BLOB NOT NULL,                 -- a Yjs update (AD-14)
  created_at TEXT NOT NULL
);
CREATE INDEX idx_plan_updates_plan ON plan_updates(plan_id, seq);
```

`plan_updates` is the append-only Yjs log (AD-14). A periodic **squash** collapses a plan's rows into a single state update (persistence housekeeping, not versioning — AD-5). Squash trigger this change: on the last client disconnecting from a room, or when a plan's row count crosses a threshold (initial value tuned in implementation; not a product decision).

## Backend surface

All paths are behind Caddy's `/api/*` (prefix stripped), so the backend serves them at root, matching `auth_routes.py`.

### Plan index (REST)

- `GET /spaces/me` → the caller's Personal space, **created on first access** (lazy materialization of AD-1): resolve `spaces JOIN space_members ON space_members.space_id = spaces.id WHERE user_id = ? AND kind = 'personal'`; if absent, create the `spaces` row + the one `space_members` row (`role='owner'`). `{ id, kind: "personal" }`. 401 if anonymous. This get-or-create is the **single writer of Personal spaces**, which is where "exactly one Personal space per user" (AD-1) is enforced — it is an application invariant, not a DB constraint, because the condition spans `spaces` and `space_members`.
- `GET /plans` → plans in the caller's Personal space: `[{ id, name, theatre, updatedAt, lastEditor }]`. Excludes `deleted_at` rows (none this change).
- `POST /plans` → commit a plan: body `{ id, name, theatre }` (client-chosen `id`). Inserts the `plans` row. `409` on the `UNIQUE(space_id, name)` violation. This is the defer-commit step, not a blank-plan factory.
- `PATCH /plans/{id}` → `{ name }` rename. `409` on name collision; `404` if the plan is not in the caller's space.
- No `DELETE` (AD-7, deferred).

Authorization: every route resolves `session user → their Personal space`, and `/plans/{id}` checks the plan's `space_id` matches. No cross-space access this change (no squadrons).

### Sync WebSocket (`pycrdt`, AD-14)

- `WS /sync/{planId}` — authorized by the session cookie: the socket is accepted only if `planId` resolves to a `plans` row in the caller's space. On connect, the server loads the plan's updates (squashed state + tail) into a server-side `pycrdt` document and runs the `y-protocols` sync handshake; subsequent client updates are applied to the server doc and appended to `plan_updates`.
- The client uses `y-websocket`'s `WebsocketProvider(baseWsUrl, planId, yDoc)`.
- **Cookie on upgrade:** the WebSocket is same-origin (single-origin Caddy), so the `SameSite=Lax` session cookie is sent on the upgrade request. Confirmed against the dev Vite proxy (`ws: true`, added) and the prod Caddy `reverse_proxy` (already upgrades).
- **Library adoption — decided (spike, task 1.2):** adopt **`pycrdt-websocket`** (`pycrdt` 0.14.8, `pycrdt-websocket` 0.16.5). Its module is `pycrdt.websocket`. The FastAPI route accepts the socket, wraps it in `pycrdt.websocket.websocket.HttpxWebsocket(websocket, planId)` (the channel `path` is the room name), and calls `WebsocketServer.serve(channel)`; the `WebsocketServer` is started in the app lifespan (`async with ws_server:`). The spike confirmed bidirectional sync and server-side document comprehension over a live socket using the same y-protocols format the browser `y-websocket` client speaks, so no hand-written handler is needed. Persistence uses `pycrdt.store` (a `BaseYStore`) writing to `plan_updates`; `auto_clean_rooms` is disabled so a room's doc persists across the last client disconnecting (we drive squash/eviction ourselves). The Caddy/Vite WebSocket-upgrade + session-cookie round-trip is confirmed as part of task 10.2 (the mechanism itself is validated).

### Wire-format reshape (AD-2)

Today the kneeboard/import endpoints take a `FlightPlan` with `aircraft` nested inside it (`flight_plan.py:116`, read at `:632/:647/:697/:703`; import synthesises it at `:129-135`). Profiles are a separate first-class entity now (AD-2), so **`aircraft` is un-nested from the request `FlightPlan` model**; the kneeboard/import request body becomes `{ flightPlan, aircraft }` with the two passed separately to the generation functions.

Because **profile sync is deferred**, the frontend continues to resolve the plan's aircraft/profile locally and send it alongside the derived plan JSON — the reshape is about *where `aircraft` sits in the wire format*, not about the server fetching a profile. The legacy v1.2 synthesis path (`:129`) is removed; pre-reshape clients are not a concern (same-origin frontend ships together). **BREAKING** at the backend wire boundary.

The kneeboard endpoint keeps receiving derived JSON this change (not reading the Y.Doc), even though `pycrdt` makes server-side derivation possible — that is a later option, out of scope here.

## Client

### Multi-doc management

`useYjsFlightPlan` currently hardcodes one Y.Doc and one IndexedDB store (`dcsplan-flightplan-ydoc`). It becomes **keyed by plan id**:

- The hook takes the active plan id and opens `dcsplan-flightplan-ydoc-{id}` via `IndexeddbPersistence`.
- When signed-in **and** the plan is committed, it also attaches `WebsocketProvider(wsUrl, id, yDoc)`; both providers share the one Y.Doc (IndexedDB = offline cache, WebSocket = sync).
- Switching the active plan tears down the previous providers (`destroy()`) and opens the new plan's. `FlightPlanContext`'s public API (`onFlightPlanUpdate`, `replaceFlightPlan`, `undo`/`redo`, snapshot) is unchanged; only the doc it wraps changes.

The **anonymous** tier keeps a single local plan under its existing store name — no provider, no id-keying needed; `add-yjs-flightplan`'s legacy localStorage migration is untouched.

### Local cache lifecycle

**Non-active plans remain cached in IndexedDB** (offline-first, by design). Switching away calls `IndexeddbPersistence.destroy()`, which only detaches the provider; it does **not** delete the store (`clearData()` does). So every opened plan keeps its own `dcsplan-flightplan-ydoc-{id}` store, letting a previously-opened plan re-open instantly and be edited offline, converging on reconnect via the CRDT.

Consequences, handled as follows:

- **Unbounded local growth** — nothing evicts opened-plan stores. This is the client mirror of the server's deferred "unbounded history growth"; plans are small, so it is *tracked, not solved* here, revisited only if measured. Evicting on switch (cache only the active plan) was rejected: it would drop offline access to other plans and re-download on every switch.
- **Stale-then-live on reopen** — a cached plan edited elsewhere loads from IndexedDB first, then the WebSocket provider merges newer state a beat later. No data loss (CRDT), but `plan-sync` specifies that a reopened plan shows a **syncing** state until the provider has synced, rather than presenting the cache as authoritative.
- **Logout clears synced caches, keeps the anonymous plan (policy L1).** On logout, `clearData()` is called on the **committed/synced** plan stores — the server holds those copies — while the anonymous local plan's store is left untouched (it may be the user's only copy; full device-wipe remains AD-8's, deferred to `add-local-data-import`). This closes the shared-simulator-PC lingering gap for the synced data this change introduces, without pulling in the AD-8 migration.
- **Orphans from deletion** (a plan removed on another device) leave a dangling local store; cleanup rides with deletion (`add-trash-and-soft-delete`). This change only ensures the active-selection pointer falls back to Home when a `planId` no longer resolves.

### Draft lifecycle (defer-commit, AD-15)

The plan id is **client-generated at New-plan time** and used as the IndexedDB key from the start, so a draft and its committed form share one id and store — no re-keying on commit.

1. **New plan** (Home) → theatre picker (plan-lifecycle) + a name (defaulted, editable) → a local draft Y.Doc opens under the new id; app routes to NAV. Not in `plans`, no WebSocket. Behaves exactly like the anonymous local plan.
2. **First waypoint** → `POST /plans { id, name, theatre }` registers the plan in the space; the client then attaches the WebSocket provider (room = id), whose initial sync uploads the current doc state. The plan now appears in `GET /plans`.
3. **Abandon** an empty draft (new plan, or navigate to Home without adding a waypoint) → discard the local Y.Doc and its IndexedDB store; nothing was ever registered server-side.

### Active-selection state

Per-device pointer in `localStorage`: `dcsplan-active-selection = { spaceId, planId }`. On load for a signed-in user, restore it, validate `planId` against `GET /plans`, and fall back to Home if it no longer resolves (deleted on another device, not in the space). `spaceId` is always the Personal space this change; it is stored now so the squadron switcher (AD-15) is a render-only addition later.

## UX (Concept A + tab grouping, AD-15)

### Home screen

Signed-in landing. Lists the Personal space's plans — `name · theatre · edited {relative} · {lastEditor}` — with **+ New plan** and inline **rename**. The space switcher is **not rendered** this change (one space); the layout reserves its row for the squadron future. Selecting a plan sets the active pointer and routes into NAV.

### Editing surface

Read-only breadcrumb + grouped tabs:

```
‹ {planName} │  NAV*  PERF  ATTACK   ┊   LIBRARY        [auth] About
  back to Home   └─ plan-scoped ──┘       └ space-scoped
```

- The breadcrumb is just the plan name this change (no space segment yet, AD-15); it links back to Home.
- Tabs split into a **plan-scoped cluster** (NAV, ATTACK, and PERF — whose plan-facing controls are the profile assignment and per-leg regime bindings) and a **space-scoped cluster** (LIBRARY), separated by a divider. PERF's split between plan-scoped assignment and space-scoped profile editing is handled *inside* the PERF screen, not by the tab bar.
- **Anonymous tier:** no breadcrumb, no Home; `/` is NAV on the single plan, exactly as today. The grouping/divider is cosmetic and harmless if shown, but the breadcrumb is signed-in only.

### Rename collisions (A1)

Inline **"Name must be unique"** within the space, matching the existing regime-name precedent (`PerformancePage.tsx:63`): the confirm is disabled and a message shown while the name collides with another plan in the space. The `UNIQUE(space_id, name)` constraint and the `409` responses are the server-side backstop. Comparison is exact, trimmed.

## Connectivity behaviour (the second axis)

A **signed-in but disconnected** user is not anonymous (AD-9): they keep editing against the local Y.Doc (IndexedDB), and `y-websocket` reconnects and merges automatically via the CRDT when the network returns. The plan list (`GET /plans`) is unavailable offline; the active plan remains editable from its local cache, and newly created drafts commit (`POST /plans`) when connectivity returns.

## Risks & open questions

- **`pycrdt` / `pycrdt-websocket` maturity and FastAPI integration** — the one real unknown (AD-14). Mitigation: a short integration spike is the first implementation task; if it disappoints, AD-14's rejected dumb-relay is the fallback (heavier later, but unblocks).
- **Cookie on WebSocket upgrade through Caddy/Vite** — expected to work (same-origin, `SameSite=Lax`), verified early.
- **Squash cadence** — a tuning value, not a product decision; start conservative (squash on empty-room), measure.
- **Library refs on a second device** — a synced plan referencing local-only library objects renders missing-object placeholders (AD-4/AD-7), until library sync lands. Noted as a non-goal consequence, not solved here.

## Migration

No destructive migration. The `yoyo` migration only adds `spaces`, `space_members`, `plans`, `plan_updates`. The anonymous local plan is untouched; signing in does **not** import it (AD-8, deferred to `add-local-data-import`). On logout, synced plan caches are cleared and the anonymous local plan is preserved (policy L1, see Local cache lifecycle) — a narrowing of `add-user-accounts`'s preserve-everything behaviour, now that synced plans have a server copy.
