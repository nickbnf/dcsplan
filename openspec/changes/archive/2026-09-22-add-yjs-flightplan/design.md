# Design

## Context

The flight plan is currently a plain TypeScript object held in React state (`FlightPlanContext`), persisted to localStorage by a debounced `useEffect` (`usePersistedFlightPlan`), and made undoable by a snapshot-based stack (`undoHistory.ts`). Every mutation flows through `onFlightPlanUpdate(newPlan)`, which receives a complete replacement `FlightPlan` object. About 60 call sites across 10 components use this API.

See proposal.md for why this changes now and what the end state is. This document covers how.

## Goals / Non-Goals

**Goals:**
- The Y.Doc is the single source of truth; React state is a derived snapshot
- Every existing `onFlightPlanUpdate` call site works without changes
- Undo/redo behaves identically to the user (all `edit-undo` scenarios pass)
- Flight plan survives reload (IndexedDB persistence replaces localStorage)
- Existing users' stored plans migrate seamlessly
- The binding module is unit-testable independently of React

**Non-Goals:**
- Optimising the structural diff for large plans (hundreds of waypoints) — current plans are small
- Making the Y.Doc schema extensible for library/performance — those stay outside Yjs
- Supporting concurrent Y.Doc updates from multiple sources — there is no network provider yet

---

## Decisions

### D1 — Y.Doc schema

The Y.Doc mirrors the `FlightPlan` type with this structure:

```
Y.Doc
 └─ Y.Map('flightPlan')                     ← the flight plan
     ├─ 'theatre'        → string
     ├─ 'name'           → string
     ├─ 'declination'    → number
     ├─ 'bankAngle'      → number
     ├─ 'initTimeSec'    → number
     ├─ 'initFob'        → number
     ├─ Y.Array('points')
     │    └─ Y.Map per waypoint
     │         ├─ 'id'         → string
     │         ├─ 'lat'        → number
     │         ├─ 'lon'        → number
     │         ├─ 'tas'        → number
     │         ├─ 'alt'        → number
     │         ├─ 'fuelFlow'   → number
     │         ├─ 'windSpeed'  → number
     │         ├─ 'windDir'    → number
     │         └─ ...optional fields set/deleted as present
     ├─ Y.Array('libraryRefs')
     │    └─ Y.Map per ref { uuid, comment? }
     ├─ Y.Array('markers')
     │    └─ Y.Map per marker { id, type, lat, lon, ... }
     └─ Y.Map('attackPlanning')             ← absent when no attack data
          ├─ Y.Map('params') { ... }
          └─ Y.Map('results') { ... }       ← absent when not computed
```

**Why a single `flightPlan` Y.Map rather than top-level keys:** a single named map makes `Y.UndoManager` scoping simple — track one shared type and all flight plan mutations are captured. It also makes `replaceFlightPlan` clean: delete all keys from the map, write new ones, in one transaction. The name `'flightPlan'` is intentional — it reads clearly if the Y.Doc later holds sibling maps for other concerns.

**Why Y.Map per waypoint rather than a flat array of JSON:** Yjs conflict resolution operates on shared types. A Y.Map per waypoint means two users editing different fields on the same waypoint merge cleanly (field-level CRDT). A JSON blob per waypoint would be opaque to Yjs — any change replaces the whole waypoint, and concurrent edits to the same waypoint lose one.

**Optional fields** (`name`, `comment`, `regimeId`, `groundAlt`, `exitTimeSec`, `hack`, `waypointType`): stored as Y.Map entries when present, deleted from the Y.Map when absent. The snapshot derivation omits `undefined` entries to match the TypeScript type.

**`attackPlanning`**: the `results` sub-object is a computed value (large, ~20 fields), regenerated on Calculate. It is stored in the Y.Doc so it persists across reload, but it is set/replaced as a whole — individual result field edits don't happen. The `params` sub-map is user-edited and merges field-by-field.

**Rejected:** storing `attackPlanning.results` as an opaque JSON string rather than a Y.Map — it would work but loses CRDT benefits for no gain, and makes the schema inconsistently shaped.

### D2 — Structural diff: `applyFlightPlanToYDoc`

The diff takes `(yDoc: Y.Doc, oldPlan: FlightPlan, newPlan: FlightPlan)` and applies the delta as Yjs operations inside a single `yDoc.transact(...)`. The caller provides `oldPlan` (the last snapshot we derived from the Y.Doc), so the diff always compares two plain objects — never reads the Y.Doc directly.

The diff has three levels:

**Scalars** (`theatre`, `name`, `declination`, `bankAngle`, `initTimeSec`, `initFob`): compare old vs new, `yMap.set(key, value)` if different.

**Id-keyed arrays** (`points` keyed by `id`, `libraryRefs` keyed by `uuid`, `markers` keyed by `id`):
1. Build a map `oldId → index` from the old array
2. Walk the new array:
   - If the id exists in old → compare field-by-field, `yItemMap.set(field, value)` for each difference
   - If the id is absent in old → insert a new Y.Map at the correct position
3. Walk old ids not present in new → delete the Y.Map at its current Y.Array position
4. If surviving items changed order → handle via delete + re-insert at the correct position

Order matters because waypoints are positional (leg computation depends on sequence). The Y.Array must reflect the new order.

**Nested objects** (`attackPlanning`): if new has it and old doesn't → create sub-maps; if new doesn't and old does → delete the key; if both have it → diff `params` field-by-field, and replace `results` in its entirety (it's computed, not user-edited, so field-level diff is wasted work).

**Why the caller provides `oldPlan` rather than reading the Y.Doc:** this avoids circular dependency (the Y.Doc observe fires a new snapshot, which becomes the next `oldPlan`). It also makes the diff a pure function of two plain objects + the Y.Doc mutations, which is easy to test.

**Why not a generic deep-diff library:** the schema is small and fixed. A generic diff would need to be told which arrays are id-keyed vs positional, how to handle optional nested objects, and when to replace vs merge. A schema-aware diff is ~150 lines and has no edge cases the author didn't write.

### D3 — Snapshot derivation: `snapshotFromYDoc`

Reads the Y.Doc's shared types and returns a plain `FlightPlan` object. Called:
- Once on initialisation (after the IndexedDB provider has synced)
- On every Y.Doc `'update'` event (which fires after each transaction)

The snapshot is derived synchronously — no async. The Y.Doc is always in a consistent state after a transaction.

Y.Map entries that are `undefined` or absent are omitted from the snapshot, matching TypeScript optional fields. Y.Array entries are read in order.

**No deduplication needed.** `snapshotFromYDoc` only runs in response to a Y.Doc `'update'` event, which only fires when `applyFlightPlanToYDoc` emitted at least one Yjs operation — and that only happens when the diff found an actual difference. A no-op `onFlightPlanUpdate` (identical plan re-emitted) produces zero operations, no event, and no snapshot call. So every snapshot is genuinely new; no shallow-compare guard is needed.

### D4 — FlightPlanContext rewiring

The context's public API is unchanged. Internal changes:

```
                     BEFORE                          AFTER
                     ══════                          ═════
Source of truth      useState<FlightPlan>            Y.Doc
Persistence          usePersistedFlightPlan          y-indexeddb provider
                     → debounced localStorage        → automatic IndexedDB
Undo                 undoHistory.ts (snapshots)      Y.UndoManager
Redo                 undoHistory.ts                  Y.UndoManager
canUndo/canRedo      historyCanUndo/canRedo          undoManager.undoStack.length > 0
```

**`onFlightPlanUpdate(newPlan, options?)`:**
1. Compute `applyFlightPlanToYDoc(yDoc, currentSnapshot, newPlan)` inside `yDoc.transact(...)` with the `origin` set to `'local'` (to distinguish from provider syncs in the future)
2. Y.UndoManager captures the transaction as one undo entry
3. The Y.Doc `'update'` event fires → `snapshotFromYDoc` → `setFlightPlan(snapshot)`

**`replaceFlightPlan(newPlan)`:**
1. `undoManager.clear()`
2. Inside `yDoc.transact(...)`: delete all content from the `flightPlan` Y.Map, then apply the new plan
3. Snapshot fires as above

**Coalescing** (slider drags → one undo entry): `Y.UndoManager` has a `captureTimeout` option — transactions within this window are merged into one stack entry. Set to `500` to match the current `COALESCE_WINDOW_MS`. This is simpler than the current per-key coalescing: Y.UndoManager merges *all* transactions within the window, regardless of which control caused them. This is acceptable because rapid distinct actions (delete waypoint A, then immediately delete waypoint B within 500ms) are extremely unlikely — the user has to confirm deletions, select targets, etc. The current `coalesceKey` mechanism prevents merging across *different* controls, but in practice the only coalesced controls are the declination and bank angle sliders, which are never used simultaneously. If a case arises where two fast operations from different controls need to stay distinct, we can revisit.

**`coalesceKey` and `label` options on `FlightPlanUpdateOptions`:** `coalesceKey` becomes unnecessary with `captureTimeout` — remove it. `label` is defined but never used by any component; remove it from the type. Both can be re-added later with Y.UndoManager stack-item metadata if needed.

**Undo depth:** Y.UndoManager keeps all items by default. To satisfy the `edit-undo` spec's "at least twenty" requirement and prevent unbounded memory growth, trim the undo stack after each push: if `undoManager.undoStack.length > 50`, splice the oldest entries. This mirrors the current `DEFAULT_DEPTH = 50`.

### D5 — Waypoint `id`

Add `id: string` to `FlightPlanTurnPoint`. Generated via `crypto.randomUUID()`. Assigned at creation and never reassigned.

**Where ids are generated:**
- `flightPlanUtils.addTurnPoint` — new waypoint at end
- `flightPlanUtils.insertTurnPointAtPosition` — insert between existing
- `flightPlanUtils.insertTurnPointAtMidpoint` — insert at leg midpoint
- Import of pre-1.6 files — each waypoint missing `id` gets one on load
- Migration of localStorage data — same

**Export:** `id` is included in exported `.json` files. Importing a previously-exported file preserves ids, making re-import deterministic (the diff sees the same ids and updates in place rather than delete + re-create).

**Backend:** the `id` field is extra data in the kneeboard request body. Pydantic's `FlightPlan` model ignores unknown fields by default (`model_config = ConfigDict(extra='ignore')`); verify this is the case and add it if not. No backend logic change.

**`FLIGHT_PLAN_VERSION`** bumps from `"1.5"` to `"1.6"`.

### D6 — Persistence: y-indexeddb

The `IndexeddbPersistence` provider from `y-indexeddb` is created alongside the Y.Doc in `FlightPlanContext`. It persists the Y.Doc's binary state to IndexedDB under a fixed database name (e.g. `dcsplan-flightplan-ydoc`).

**Initialisation sequence:**
1. Create Y.Doc
2. Create `IndexeddbPersistence(dbName, yDoc)`
3. Wait for `provider.whenSynced` (resolves when IndexedDB data is loaded into the Y.Doc)
4. Derive the initial `FlightPlan` snapshot from the Y.Doc
5. If the Y.Doc is empty (new user or post-migration), apply the default flight plan
6. Render

**Why wait for `whenSynced`:** without this, the first render sees an empty Y.Doc and the app flashes a blank state before the persisted data loads. `whenSynced` is fast (local IndexedDB read, typically <50ms) and avoids the flash.

**Async init in React:** the context uses a `useState<FlightPlan | null>(null)` initialised to `null`, with a `useEffect` that creates the Y.Doc + provider and sets the state once synced. Components see `null` during the brief loading window. `FlightPlanProvider` renders nothing (or a minimal loading indicator) until the Y.Doc is ready. This is a small behavioural change (the current `usePersistedFlightPlan` is synchronous because `localStorage.getItem` is synchronous), but the delay is imperceptible.

**Rejected:** loading IndexedDB synchronously before `ReactDOM.createRoot` (as migrations do) — `y-indexeddb` is async by design and fighting it would mean reimplementing the provider.

### D7 — Migration: localStorage → Y.Doc

Runs once, pre-mount (synchronous), in `main.tsx` after existing migrations:

1. Read `dcsplan-flightplan` from localStorage
2. If absent → no-op (new user or already migrated)
3. Parse and validate (same logic as `loadFlightPlan` in `usePersistedFlightPlan.ts`)
4. Generate `id` for any waypoint missing one
5. Write the migrated `FlightPlan` JSON to a temporary localStorage key (`dcsplan-flightplan-migration`)
6. Remove the original `dcsplan-flightplan` key

Then, in `FlightPlanContext`'s async init:

7. After `whenSynced`, if the Y.Doc is empty, check for the migration key
8. If present → `applyFlightPlanToYDoc` to seed the Y.Doc, then remove the migration key
9. If neither migration key nor Y.Doc data → apply default flight plan

**Why two stages:** the localStorage part must be synchronous (so the old key is removed before any read could race), but writing to the Y.Doc must be async (after `whenSynced`). The migration key bridges the two.

**Rollback:** if anything fails, the original `dcsplan-flightplan` key is left untouched (the removal in step 6 is the last synchronous operation, so if steps 3–5 fail, we never reach it). The app falls back to the old code path... except the old code path is being removed. So: the migration must be robust. Wrap in try/catch; on failure, log a warning and leave the key for a future attempt.

Actually, a simpler approach: don't remove the localStorage key at all in step 6. Instead, remove it *after* the Y.Doc is confirmed seeded (step 8). The migration key becomes unnecessary — we just check: "Y.Doc empty? → read localStorage → seed Y.Doc → remove localStorage." One stage, not two.

**Revised migration (simpler):**

In `FlightPlanContext`'s async init, after `whenSynced`:
1. If Y.Doc has content → use it (normal path)
2. If Y.Doc is empty → try reading `dcsplan-flightplan` from localStorage
3. If found → parse, generate missing `id`s, `applyFlightPlanToYDoc`, remove localStorage key
4. If not found → apply default flight plan

This is safe because localStorage reads are synchronous and the Y.Doc is already synced (no race). The localStorage key is only removed after a successful Y.Doc write. If the write fails, the key survives for the next attempt.

### D8 — Test strategy

The Yjs binding module (`applyFlightPlanToYDoc`, `snapshotFromYDoc`) is pure logic: Y.Doc in, FlightPlan out, or vice versa. Test it with Vitest unit tests, no React, no DOM:

- Scalar field changes
- Waypoint add, remove, reorder, field edit
- libraryRef and marker add, remove, field edit
- attackPlanning create, update params, set results, remove
- Optional field set/clear (regimeId, comment, groundAlt, etc.)
- Round-trip: plan → apply → snapshot → equals original
- Empty plan (no points, no markers, no refs)
- Migration: plan without waypoint ids → ids generated

The FlightPlanContext integration (undo, redo, persistence) is tested via the existing test suite in `FlightPlanContext.test.tsx`, adapted to await the async init.

---

## Risks / Trade-offs

**[Async init introduces a loading state]** → The current synchronous `localStorage.getItem` init has no loading flash. The new `y-indexeddb` init is async. Mitigation: `whenSynced` is fast (local read), and the loading state is a `null` check in the provider — no spinner needed, just don't render the app for the <50ms it takes.

**[`captureTimeout` coalescing is less precise than `coalesceKey`]** → All transactions within the 500ms window merge, not just same-key ones. Mitigation: the only coalesced controls are declination and bank angle sliders, and rapid cross-control edits within 500ms don't happen in practice. If they do, the result is merely a slightly larger undo step — functional, just less granular.

**[Y.Doc binary size in IndexedDB]** → A Yjs document stores the full operation history (not just current state), so IndexedDB usage will be larger than the localStorage JSON. For a typical flight plan (<50 waypoints, <20 markers), this is negligible — tens of KB at most. Heavy editors who make hundreds of edits might reach low single-digit MB. Not a concern at current scale.

**[Snapshot derivation on every Y.Doc update]** → `snapshotFromYDoc` runs on every transaction commit. For the current data size (tens of waypoints) this is sub-millisecond. If plans grow to hundreds of waypoints, a diff-based incremental approach could replace it — but that's premature now.

**[Migration failure leaves user with an empty plan]** → If localStorage parsing succeeds but Y.Doc seeding fails (unlikely — it's a local write), the user sees a blank plan. Mitigation: the localStorage key is only removed after successful seeding (D7). On next reload, the migration retries.

---

## Open Questions

None. All design decisions are resolved.
