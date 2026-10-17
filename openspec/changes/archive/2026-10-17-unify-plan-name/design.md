# Design

## Context

See `proposal.md` for the why. State this change starts from (all from `add-cloud-sync`):

- The plan's name lives in two places: `plans.name` (index, renamed via `PATCH /plans/{id}` from `PlansHomePage`) and the Y.Doc root map `flightPlan.name` (a plain string, edited in `FlightPlanZone` via `EditableField`, which commits on blur/Enter).
- Plan ids are UUIDs from `crypto.randomUUID()`, minted client-side at draft creation and used as the sync room key and the IndexedDB store key.
- The active plan is chosen by `PlanSelectionContext` (`selectPlan`, `newDraft`, a `localStorage` pointer); routes are flat (`/`, `/performance`, `/attack`, `/library`, `/plans`).
- The server holds each open plan's document in `pycrdt` (AD-14); `PlanYStore.write` is called once per applied update.
- Cross-capability rules still apply unchanged: AD-1 (space ownership), AD-6 (Yjs plan), AD-14 (pycrdt sync), AD-15 (Home + plan-scoped/space-scoped split).

## Goals / Non-Goals

**Goals:** one editable name with the index following it; short, stable, id-based addresses that survive renames; one routing scheme for both tiers; renames that never remount the editor.

**Non-goals (design-level):** server-rendered or SEO-friendly URLs; redirecting old UUID-based URLs (nothing was ever deployed); validating names (length is already capped at 25 by the editor field).

## Decisions

### D1 — Short ids: 12 base58 characters, client-generated

Alphabet `123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz` (no `0 O I l`), 12 characters ≈ 70 bits. Generated in a new `utils/planId.ts` with `crypto.getRandomValues` and **rejection sampling** (take 6 bits, discard values ≥ 58) to avoid modulo bias. `local` is reserved for the anonymous plan and is never generated (it contains `l`, which is outside the alphabet, so it cannot collide).

The server validates ids against `^[1-9A-HJ-NP-Za-km-z]{12}$` on `POST /plans` and on the sync socket, which also keeps arbitrary strings out of room names. A duplicate id is a PK violation → `409`, surfaced by the client as a generic commit failure: at ~70 bits, a collision is not worth re-keying a draft's local store.

*Alternatives:* base58-encoding the UUID (22 chars, two representations of one id); a separate public-id column (two ids per plan); sequential or hashids ids (enumerable, and they need the server to assign ids, which breaks offline draft creation).

### D2 — The server keeps `plans.name` in step with the document

`PlanSyncServer.get_room` passes the room's `ydoc` to its `PlanYStore`. In `write` (async, called after the update has been applied to the server doc), the store reads `ydoc.get("flightPlan", type=Map).get("name")`, compares it with the last value it saw, and on change runs `UPDATE plans SET name = ?, updated_at = ? WHERE id = ?`. Otherwise it only refreshes `updated_at`, so the Flight Plans list's "edited … ago" reflects real edits rather than only renames.

Renames made offline reach the server as ordinary updates on reconnect and update the index the same way. The client never writes `plans.name` after `POST /plans` (which seeds it from the draft's name).

*Alternative:* the client calls `PATCH` when the name changes. Rejected: offline renames would leave the index stale until the next online edit, and it duplicates a write path the server already sees.

### D3 — The URL is the active selection

`PlanSelectionProvider` sits inside the router (it is the layout route's element), so it reads `useLocation()` and extracts the requested id with `matchPath('/p/:id/*', pathname)`. Resolution happens during render, so `FlightPlanProvider` opens the right document first, with no load-then-switch:

| Requested | Anonymous | Signed in |
|---|---|---|
| `/p/local/…` | the local plan | not in the space → Home |
| `/p/<id>/…`, id in space list | → `/p/local/…` | that plan (synced) |
| `/p/<id>/…`, id is the current draft | — | the draft (local-only) |
| `/p/<id>/…`, unresolved | → `/p/local/…` | Home |
| no `/p/` (`/plans`, `/library`) | the local plan | last opened plan (stored pointer), else Home |

While the signed-in plan list is still loading, resolution waits (`isLoadingSelection`), and `Layout` shows its existing loading state, so an id is never judged unresolved before the list arrives.

Selection actions become navigation: `PlansHomePage` navigates to a plan's address, and `newDraft` returns the new id so the caller navigates to it. The `localStorage` pointer is still written when a plan is opened; it only serves the space-scoped routes and the `/` landing.

*Alternative:* a route-level gate component that calls `selectPlan` from an effect. Rejected: the provider would first load the previously active plan, then switch, so you'd get a double load and a flash.

### D4 — Route table

```
/                     → redirect to the active plan's NAV address
/performance          → redirect to …/perf        (legacy)
/attack               → redirect to …/attack      (legacy)
/plans                → Flight Plans home
/library              → theatre library (space-scoped)
/p/:id                → redirect to /p/:id/:slug
/p/:id/:slug          → NAV
/p/:id/:slug/perf     → PERF
/p/:id/:slug/attack   → ATTACK
```

The slug is always present in canonical addresses, so `/p/:id/<x>` (two segments) is never ambiguous with a tab suffix: a plan named "perf" lives at `/p/:id/perf` and its PERF tab at `/p/:id/perf/perf`. Slugs come from the existing `slugifyPlanName`, falling back to `plan` when the name slugifies to empty.

The three tab routes are children of one `/p/:id/:slug` parent whose element renders `<Outlet/>`. React Router re-renders matched elements when params change rather than remounting them, so a slug change preserves editor state, as long as nothing is keyed on the location or the slug.

### D5 — Canonicalizing the slug in place

A `useCanonicalPlanPath()` hook in the `/p/:id/:slug` parent element compares the `:slug` param with `slugifyPlanName(flightPlan.name)` once the plan is ready and the URL id matches the active plan. On mismatch it calls `navigate(sameIdNewSlug + tabSuffix + search, { replace: true })`. This covers:

- a local rename (one replace per commit, since `EditableField` commits on blur/Enter);
- a rename arriving from another device;
- a stale or missing slug in a pasted link.

`replace` means renames don't add history entries.

### D6 — Layout reads the plan, not the index

`Layout` builds tab links from `activePlanId` + the current slug (`/p/{id}/{slug}`, `…/perf`, `…/attack`); LIBRARY stays `/library`. The breadcrumb shows `useFlightPlan().flightPlan.name` (it already sits inside `FlightPlanProvider`), so `activePlanName` and the draft-name bookkeeping in `PlanSelectionContext` go away. The Home/anonymous redirects from `add-cloud-sync` move into the D3 resolution and the D4 redirects.

### D7 — Destructive migration

`0003.recreate-plans.sql` drops `plan_updates` and `plans` and recreates them exactly as in `0002`, minus `UNIQUE(space_id, name)`. `spaces` and `space_members` are untouched. The rollback recreates the `0002` shape (empty). This is acceptable because the server has never been deployed (agreed with the maintainer).

### D8 — Drafts commit on their first edit; only pristine drafts are discarded

*(Added during implementation, after local testing showed empty drafts being committed.)*

- **Commit only from the draft's own document.** `FlightPlanProvider` holds the previously loaded plan for one render after a switch, so the draft check requires `loadedPlanId === activePlanId`. Without it, an empty draft created from Home was committed by the *local* plan's waypoints.
- **"Identical to a fresh plan" = no user edit yet.** The provider listens to the draft's Y.Doc for updates with a user origin (`local`, `replace`, or undo/redo) and ignores the seed (`migration`) and the IndexedDB load. Comparing the snapshot to the seed was rejected: a component that normalises a field on load would make a fresh draft look edited, and a detector based on edit origins is exact. An edit that is later reverted still counts, which is acceptable.
- **The first edit commits.** Every later edit retries a commit that has not landed yet.
- **A commit that fails keeps the draft.** The draft is marked `pendingCommit`. It is retried on `online` and on the next edit, and the error is shown in the top bar. A `409` (the id already exists, e.g. an earlier attempt landed but its response was lost) is reconciled by refreshing the list. Leaving discards a draft only when no commit was ever attempted.
- **Known limit:** a pending draft lives in memory. Reloading before it commits leaves its local store orphaned (not deleted) and unreachable. Sweeping or re-adopting orphaned drafts is deferred.

## Risks / Trade-offs

- **Reloading a draft's address loses the draft** (it is not in the space list until its first waypoint) → resolves to Home; same as today, and the draft held no waypoints by definition.
- **Old UUID-keyed IndexedDB stores are orphaned** on dev machines → harmless leftovers, never re-opened; the anonymous `local` store is unaffected.
- **Index name lags the document while a plan is only open offline** → by design: the list shows the last name the server saw, and it catches up on reconnect.
- **A plan named so that its slug equals a tab name** (`perf`, `attack`) → unambiguous because the slug is always present (D4); covered by a routing test.
- **`updated_at` written on every update** → one extra `UPDATE` alongside the existing `INSERT` per update; acceptable at this scale (AD-13), revisit if write load matters.

## Migration Plan

1. Apply `0003` (drops plan data; spaces and memberships survive).
2. Deploy backend and frontend together (same origin; the wire format for `POST /plans` only changes its id format).
3. Rollback: revert both, and roll back `0003` (recreates empty `0002`-shaped tables).
