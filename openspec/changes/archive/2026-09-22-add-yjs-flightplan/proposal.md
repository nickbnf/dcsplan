## Why

AD-6 (revised 2026-09-22) directs the flight plan to use Yjs CRDTs, so that the architecture supports real-time collaboration from the start rather than retrofitting it after a full LWW server is built. Wiring Yjs on the client before the server exists is the cheapest time to make this change — no server to rewrite, no sync protocol to re-negotiate, and the entire existing test suite validates that user-visible behaviour is preserved.

This change migrates the flight plan's source of truth from React `useState` + debounced localStorage to a **Yjs Y.Doc** + IndexedDB persistence, with **no network layer**. The app behaves identically from the user's perspective; the foundation is different.

## What Changes

- **Y.Doc becomes the source of truth** for the flight plan. The document mirrors the `FlightPlan` type structure: scalar fields as Y.Map entries, `points` / `libraryRefs` / `markers` as Y.Arrays of Y.Maps.
- **Structural diff bridges the existing API.** `FlightPlanContext` continues to expose `onFlightPlanUpdate(newPlan)`. Internally, the context diffs the previous and new `FlightPlan` snapshots and applies the delta as Yjs operations within a single transaction. Components are unchanged.
- **Y.UndoManager replaces the snapshot-based undo stack** (AD-12 revision). Each `onFlightPlanUpdate` call is one Yjs transaction → one undo entry. Coalescing (sustained slider drag → one undo step) uses Y.UndoManager's `captureTimeout`. `replaceFlightPlan` (import, new plan) calls `undoManager.clear()`. All eight `edit-undo` requirements hold under Y.UndoManager without modification.
- **y-indexeddb replaces localStorage** for flight plan persistence. The Y.Doc is persisted to IndexedDB automatically by the Yjs provider. This is the "autosave" path (AD-5) for the flight plan; library and performance continue to use localStorage.
- **Stable `id` added to `FlightPlanTurnPoint`.** Generated via `crypto.randomUUID()` on creation, immutable, travels with the waypoint through export/import. Required for the structural diff to match waypoints across old and new snapshots (positional diffing breaks on insert/delete). **BREAKING (storage/format):** `FLIGHT_PLAN_VERSION` bumps. Import of older files without `id` generates ids on load.
- **One-time migration** from localStorage (`dcsplan-flightplan`) to the Yjs IndexedDB store. Same pre-mount pattern as `bootstrapPerformanceFromLegacyPlan()`. After migration, the localStorage key is cleared. A user who downgrades loses the plan from IndexedDB but the localStorage key is already gone — accepted, same as every prior format migration.
- **`undoHistory.ts` is no longer used by the flight plan.** It remains available for library and performance profile undo stacks (which stay snapshot-based). If those never adopt it, it becomes dead code — no action needed now.

## Capabilities

### New Capabilities

None. No user-facing capability is introduced — the user sees the same editing, undo, persistence, and export/import behaviour.

### Modified Capabilities

None. All eight `edit-undo` requirements and all seven `plan-lifecycle` requirements were verified against the new mechanism; every scenario passes identically. The change is an internal architectural migration, not a behaviour change.

This change sets `skip_specs: true` — specs describe behaviour, and no behaviour changes.

## Non-goals

- **No network.** No WebSocket provider, no server sync, no multi-device. The Y.Doc has a local IndexedDB provider only. The WebSocket provider is added by `add-cloud-sync`.
- **No server changes.** The backend is unchanged; it continues to receive a serialized JSON flight plan (derived from the Y.Doc snapshot) for kneeboard generation and import validation.
- **No Yjs for library or performance.** These remain React state + localStorage (AD-6 revised: "LWW for library and profiles").
- **No presence or cursors.** These require a network provider and are a future addition.
- **No multiple plans.** Still one plan in the anonymous tier (AD-9). Multiple plans arrive with `add-cloud-sync`.
- **No Yjs awareness protocol.** No multi-user features; this is single-user, local-only.

## Impact

**New dependencies** — `yjs`, `y-indexeddb`. Added to `packages/frontend/package.json` via pnpm.

**`FlightPlanContext.tsx`** — major internal rewrite. The public API (`onFlightPlanUpdate`, `replaceFlightPlan`, `undo`, `redo`, `canUndo`, `canRedo`) is unchanged. Internally: creates a Y.Doc, initialises the IndexedDB provider, runs the structural diff on each update, and derives a `FlightPlan` snapshot from Y.Doc observations. The `usePersistedFlightPlan` hook is no longer used for the flight plan.

**New module: Yjs ↔ FlightPlan binding** — the structural diff (`applyFlightPlanToYDoc`) and the snapshot derivation (`snapshotFromYDoc`). This is the core new code. Bounded complexity: the `FlightPlan` schema is known and fixed; the diff handles scalars, nested objects, and id-keyed arrays.

**`usePersistedFlightPlan.ts`** — no longer used by the flight plan. May be removed or kept for other uses.

**`undoHistory.ts`** — no longer used by the flight plan. Kept for library/performance undo stacks.

**`types/flightPlan.ts`** — `FlightPlanTurnPoint` gains `id: string`. `FLIGHT_PLAN_VERSION` bumps to `"1.6"`.

**`utils/flightPlanUtils.ts`** — every function that creates a waypoint (`addTurnPoint`, `insertTurnPointAtPosition`, `insertTurnPointAtMidpoint`) must generate an `id`. The `newFlightPlan` factory is unchanged (no points to id).

**`legacyMigration.ts`** (or new migration module) — localStorage → IndexedDB migration. Generates `id` for any waypoint that lacks one.

**Export/import** — exported flight plans include `id` on each waypoint. Import of pre-1.6 files generates ids. Backend import validation (`/flightplan/import`) accepts `id` as an optional field — no backend change needed if the validator ignores unknown fields; otherwise a minor validator update.

**Backend** — unchanged for kneeboard generation. The frontend continues to marshal a JSON `FlightPlan` (snapshot from Y.Doc) into the request body. The `id` field is harmless extra data.

**All other components** — unchanged. The structural diff + context API bridge means no component needs to know about Yjs.
