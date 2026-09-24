# Tasks

## 1. Dependencies and waypoint `id` (D5)

- [x] 1.1 Add `yjs` and `y-indexeddb` to `packages/frontend/package.json` via `pnpm --filter frontend add yjs y-indexeddb`. Verify: `pnpm --filter frontend exec vitest run` still passes (no breakage from new deps), and `import * as Y from 'yjs'` resolves in a test file.

- [x] 1.2 Add `id: string` to `FlightPlanTurnPoint` in `packages/frontend/src/types/flightPlan.ts`. Bump `FLIGHT_PLAN_VERSION` from `"1.5"` to `"1.6"`. Verify: `pnpm --filter frontend exec tsc --noEmit` reports the missing `id` in every waypoint-creation site — the errors are the inventory of sites to fix in 1.3.

- [x] 1.3 Add `id: crypto.randomUUID()` to every waypoint-creation site: `flightPlanUtils.addTurnPoint`, `flightPlanUtils.insertTurnPointAtPosition`, `flightPlanUtils.insertTurnPointAtMidpoint`, and the inline waypoint literal in `flightPlanUtils.addStraighteningPoint` if it exists. Verify: `pnpm --filter frontend exec tsc --noEmit` passes clean.

- [x] 1.4 Update `isValidFlightPlan` in `usePersistedFlightPlan.ts` to accept waypoints with or without `id` (optional in validation — the migration adds it). Update `loadFlightPlan` to generate `id` for any waypoint that lacks one on load. Verify: add a unit test in `usePersistedFlightPlan.test.tsx` confirming that loading a stored plan without waypoint ids produces a plan where every waypoint has a non-empty `id`, and loading one with ids preserves them.

- [x] 1.5 Update export: `downloadFlightPlan` in `flightPlanUtils.ts` already serialises the full `FlightPlan` type, so `id` is included automatically. Verify: export a plan and confirm the `.json` file contains `"id"` on each waypoint. Update import: in `ImportFlightPlanDialog.tsx` (or wherever the import path reads waypoints), generate `id` for any imported waypoint that lacks one. Verify: import a pre-1.6 file (no ids) and confirm each waypoint has an id after import; import a 1.6 file and confirm ids are preserved.

- [x] 1.6 Verify the backend accepts the extra `id` field without error. Check the Pydantic `FlightPlan` model in `packages/backend/flight_plan.py` — if it uses a strict schema that rejects unknown fields, add `id: Optional[str] = None` to the waypoint model. Verify: `cd packages/backend && python -m pytest` passes; send a kneeboard request with `id` on waypoints and confirm it succeeds.

## 2. Yjs binding module (D1, D2, D3)

- [x] 2.1 Create `packages/frontend/src/utils/yjsFlightPlanBinding.ts` with two exported functions: `applyFlightPlanToYDoc(yDoc: Y.Doc, oldPlan: FlightPlan, newPlan: FlightPlan): void` and `snapshotFromYDoc(yDoc: Y.Doc): FlightPlan`. Implement the scalar diff for top-level fields (`theatre`, `name`, `declination`, `bankAngle`, `initTimeSec`, `initFob`) — compare old vs new, `yMap.set` if different. Implement `snapshotFromYDoc` to read scalars from the `flightPlan` Y.Map and return a `FlightPlan` with empty `points` array (arrays come in 2.2). Verify: add `yjsFlightPlanBinding.test.ts` with tests for scalar round-trip (apply a plan, snapshot it back, equals original) and scalar diff (change one field, snapshot reflects the change, others unchanged).

- [x] 2.2 Implement the id-keyed array diff for `points` in `applyFlightPlanToYDoc`: add (insert Y.Map at correct position), remove (delete from Y.Array), field-edit (set changed fields on existing Y.Map), and reorder (delete + re-insert). Implement `snapshotFromYDoc` reading of `points` Y.Array into `FlightPlanTurnPoint[]`, handling optional fields (absent Y.Map entries → omitted from the object). Verify: add tests covering — add a waypoint (array grows), remove a waypoint (array shrinks), edit a field on an existing waypoint, reorder two waypoints, optional field set and clear (`regimeId` present then absent). Each test applies the diff, snapshots, and compares to the expected `FlightPlan`.

- [x] 2.3 Implement the id-keyed array diff for `libraryRefs` (keyed by `uuid`) and `markers` (keyed by `id`) — same logic as `points` but with different key fields and simpler item schemas. Implement their snapshot reading. Verify: add tests for add/remove/edit of a libraryRef and a marker. Test a plan with no `libraryRefs` and no `markers` (both `undefined`) round-trips correctly.

- [x] 2.4 Implement the `attackPlanning` nested object diff: create/remove the `attackPlanning` Y.Map, diff `params` field-by-field, replace `results` as a whole (delete all keys, write all new keys). Implement snapshot reading for `attackPlanning`. Verify: add tests for — plan without attackPlanning round-trips, adding attackPlanning (params only), adding results, updating one param field, clearing results, removing attackPlanning entirely.

- [x] 2.5 Add a comprehensive round-trip test: construct a `FlightPlan` with all fields populated (several waypoints with all optional fields, libraryRefs, markers, attackPlanning with params and results), apply it to an empty Y.Doc, snapshot it back, and assert deep equality with the original. Then apply a second plan that modifies, adds, and removes items across all arrays, snapshot again, and assert equality with the second plan. Verify: `pnpm --filter frontend exec vitest run src/utils/yjsFlightPlanBinding.test.ts` passes.

## 3. FlightPlanContext rewiring (D4, D6)

- [x] 3.1 Create `packages/frontend/src/hooks/useYjsFlightPlan.ts` — a hook that encapsulates Y.Doc lifecycle, IndexedDB persistence, and snapshot derivation. It creates the Y.Doc + `IndexeddbPersistence` provider, waits for `whenSynced`, derives the initial snapshot, and subscribes to Y.Doc `'update'` events to keep the snapshot current. Returns `{ yDoc, flightPlan, isReady }` where `flightPlan` is `null` until `whenSynced` resolves. Verify: write a test (or a manual smoke test) that creates the hook, confirms `isReady` transitions from false to true, and `flightPlan` is the default plan for a fresh Y.Doc.

- [x] 3.2 Rewrite `FlightPlanProvider` in `FlightPlanContext.tsx` to use `useYjsFlightPlan` instead of `usePersistedFlightPlan`. While `isReady` is false, render `null` (children not mounted). Once ready, provide the snapshot as `flightPlan`. Wire `onFlightPlanUpdate` to call `applyFlightPlanToYDoc` inside `yDoc.transact(() => { ... }, 'local')`. Wire `replaceFlightPlan` to clear the Y.Map and apply the new plan in a transaction. Remove the `usePersistedFlightPlan` import. Remove the `undoHistory` imports and the `history`/`historyRef` state. Verify: `pnpm --filter frontend exec tsc --noEmit` passes. The app starts, shows the default empty plan, and editing a waypoint field persists across reload (IndexedDB).

- [x] 3.3 Wire `Y.UndoManager` in the context. Create the undo manager scoped to the `flightPlan` Y.Map with `captureTimeout: 500`. Wire `undo` → `undoManager.undo()`, `redo` → `undoManager.redo()`, `canUndo` → `undoManager.undoStack.length > 0`, `canRedo` → `undoManager.redoStack.length > 0`. Listen to `undoManager.on('stack-item-added', ...)` and `on('stack-item-popped', ...)` to trigger a React state update for `canUndo`/`canRedo`. On `replaceFlightPlan`, call `undoManager.clear()`. Trim undo stack to 50 entries after each push (`undoManager.on('stack-item-added', () => { while (undoManager.undoStack.length > 50) undoManager.undoStack.shift(); })`). Verify: start the app, make three edits, undo three times (plan returns to initial state), redo once (first edit reappears). Verify buttons reflect availability correctly.

- [x] 3.4 Remove `FlightPlanUpdateOptions` type's `coalesceKey` and `label` fields. Remove the `FlightPlanUpdateOptions` import and option handling from `ButtonZone.tsx` (the `{ coalesceKey: 'plan:declination' }` and `{ coalesceKey: 'plan:bankAngle' }` arguments). The calls become plain `onFlightPlanUpdate(updatedFlightPlan)` — coalescing is now handled by Y.UndoManager's `captureTimeout`. Verify: `pnpm --filter frontend exec tsc --noEmit` passes. Drag the declination slider continuously, then undo once — the declination returns to its pre-drag value in a single undo.

## 4. Migration (D7)

- [x] 4.1 In `FlightPlanContext` (or `useYjsFlightPlan`), after `whenSynced`, implement the migration path: if the Y.Doc's `flightPlan` Y.Map has no keys (empty), try reading `dcsplan-flightplan` from localStorage. If found, parse it (reuse the validation logic from `usePersistedFlightPlan.ts`), generate `id` for any waypoint missing one, call `applyFlightPlanToYDoc` to seed the Y.Doc, then `localStorage.removeItem('dcsplan-flightplan')`. If not found, apply the default flight plan. Wrap in try/catch — on failure, log a warning and apply the default plan. Verify: write a test that pre-populates localStorage with a v1.5 plan (no waypoint ids), creates the hook, and asserts the Y.Doc is seeded with the plan including generated ids, and the localStorage key is removed.

- [x] 4.2 Verify the full migration chain: set localStorage to a pre-1.5 plan (aircraft embedded in flightPlan, no performance key, no waypoint ids). Boot the app. The existing `bootstrapPerformanceFromLegacyPlan` + `migratePerformanceProfile` migrations run first (synchronous, in `main.tsx`), then the Y.Doc migration runs (async, in the context). After boot: the flight plan is loaded with waypoints (all with ids), the performance profile exists, and `localStorage.getItem('dcsplan-flightplan')` returns `null`. Verify: manual test or integration test covering the sequence.

## 5. Cleanup

- [x] 5.1 Remove `usePersistedFlightPlan.ts` and `usePersistedFlightPlan.test.tsx` — no longer used. Remove the `loadFlightPlan` validation helper if it was inlined into the migration path, or keep it if the migration references it. Verify: `pnpm --filter frontend exec tsc --noEmit` passes with no references to the removed module; `grep -r usePersistedFlightPlan packages/frontend/src --include='*.ts' --include='*.tsx'` returns zero hits.

- [x] 5.2 The `undoHistory.ts` module is no longer used by the flight plan. Leave it in place (library/performance undo stacks may use it in the future). Verify: confirm `undoHistory.ts` has no import from `FlightPlanContext.tsx`. The module and its tests remain compilable.

## 6. Full verification

- [x] 6.1 `pnpm --filter frontend exec vitest run` — full test suite passes.

- [x] 6.2 `pnpm --filter frontend exec tsc --noEmit` — clean type check.

- [x] 6.3 `cd packages/backend && python -m pytest` — backend tests pass.

- [x] 6.4 End-to-end manual test: start the dev server. Create a flight plan with several waypoints. Edit waypoint fields (TAS, alt, name). Add a marker and a library ref. Undo three times, redo once. Generate a kneeboard — confirm it succeeds. Export the plan — confirm the `.json` contains `id` on each waypoint and version `"1.6"`. Import a pre-1.6 file — confirm waypoints gain ids. Reload the page — confirm the plan survives (IndexedDB persistence). Open a new plan (replace) — confirm undo is unavailable. Drag the declination slider — confirm one undo reverses the whole drag. Throughout: no console errors.

- [x] 6.5 Migration end-to-end: in browser devtools, clear IndexedDB (Application → IndexedDB → delete `dcsplan-flightplan-ydoc`). Set `localStorage.setItem('dcsplan-flightplan', ...)` with a v1.5 plan JSON. Reload. Confirm the plan loads correctly with waypoint ids, and `localStorage.getItem('dcsplan-flightplan')` is `null`.
