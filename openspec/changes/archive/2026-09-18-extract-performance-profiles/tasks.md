## 1. De-mirror: resolve bound-leg TAS/FF from regime at read time (D11)

The foundational change — regime becomes the single source of truth for bound legs. Everything else in this change builds on de-mirrored resolution.

- [x] 1.1 In `computeLegSegments` (`packages/frontend/src/utils/legCalculations.ts:345`), when a regime is present and the leg is level (altitude delta = 0, or regime lacks matching transition data), use `regime.cruise.tas` and `regime.cruise.ff` instead of the waypoint's stored `tas`/`fuelFlow`. The waypoint values remain the fallback for Manual legs (no regime). Verify: add unit tests for `computeLegSegments` confirming a bound level leg returns the regime's cruise values, not the waypoint's, and a Manual level leg still returns the waypoint's values.

- [x] 1.2 Update `applyRegimeToWaypoint` in `regimeUtils.ts:4` to set only `regimeId` — stop writing `regime.cruise.tas` and `regime.cruise.ff` onto the waypoint. Update `regimeUtils.test.ts` to assert the returned waypoint has `regimeId` set but `tas` and `fuelFlow` unchanged from their prior values. Verify: `pnpm --filter frontend exec vitest run src/utils/regimeUtils.test.ts` passes.

- [x] 1.3 Remove `propagateRegimeCruiseChange` from `regimeUtils.ts:19` and its production call in `handleRegimeChange` in `PerformancePage.tsx:303`. Remove its unit tests from `regimeUtils.test.ts`. Verify: `grep -r propagateRegimeCruiseChange packages/frontend/src --include='*.ts' --include='*.tsx'` returns zero hits outside test files that explicitly document the removal.

- [x] 1.4 Confirm the inline TAS/FF editing in `FlightPlanZone.tsx` (~lines 762–787) correctly clears `regimeId` when the user directly edits TAS or FF on a bound leg. This behaviour is already implemented; the task is to verify it still works after 1.1–1.3. Verify: add a test (or confirm an existing one) that editing TAS on a regime-bound leg clears `regimeId` and the entered value is stored.

- [x] 1.5 Remove `.fails` from the regime cruise change undo test in `undoCrossEntity.test.tsx` (~line 131). After de-mirroring, editing a regime's cruise values no longer writes to the plan, so the cross-entity undo defect dissolves for this case. The regime deletion undo test (~line 151) keeps `.fails` — that case is deferred per AD-12. Verify: `pnpm --filter frontend exec vitest run src/contexts/undoCrossEntity.test.tsx` passes with one `.fails` remaining (deletion case only).

## 2. Profile name: data model, storage, and migration (D1, D2, D7)

- [x] 2.1 Add a `name: string` field to the performance storage shape. Update `loadPerformance` and `savePerformance` in `performanceStorage.ts` to read/write `{ version, name, aircraft }` from `dcsplan.performance`. When loading data that lacks `name`, derive it from `aircraft.model` (fall back to `"Default profile"`). Verify: add tests in `performanceStorage.test.ts` confirming round-trip of name, and loading old-format data (no name) returns a derived name.

- [x] 2.2 Write the pre-mount migration step in `main.tsx`, ordered after `bootstrapPerformanceFromLegacyPlan()` and before `ReactDOM.createRoot`. Logic per D7: if `dcsplan.performance` has a `name` field → no-op; else if it exists → add `name` derived from `aircraft.model` (fall back to `"Default profile"`), write back; else → write a default profile with name `"Default profile"`. Wrap in try/catch so a failed migration starts the app on defaults. Verify: write tests in `legacyMigration.test.ts` (or a new `profileMigration.test.ts`) covering: (a) pre-1.5 user gets both migrations in one boot, (b) existing user gains a name, (c) fresh install gets default profile, (d) corrupted data falls back to defaults.

- [x] 2.3 Expose profile `name` (read and write) from `PerformanceContext`. Autosave must persist name changes alongside aircraft changes. Verify: a test that sets the name via the context and confirms it appears in localStorage after autosave.

- [x] 2.4 Add a name text input to the Performance page header area. Anonymous tier: the name is editable inline, shown above or alongside the aircraft model field. No profile CRUD controls (create, delete, switch). Verify: start the dev server, navigate to the Performance page, and confirm the name field is visible, editable, and persists across reload.

## 3. Export/import with profile name (D8)

- [x] 3.1 Add optional `name?: string` to `PerformanceFileV1` in `types/flightPlan.ts`. Update `downloadAircraft` in `flightPlanUtils.ts:176` to include the profile's `name` in the exported envelope: `{ version: "1.0", name, aircraft }`. Verify: export a profile and confirm the `.perf.json` file contains `"name"` at the top level.

- [x] 3.2 Update import validation in `performanceImport.ts` (or wherever the v1.0 validator lives) to accept an optional `name` field (string). Files without `name` continue to pass validation. Verify: add tests for import of a file with `name` (passes), without `name` (passes), and with `name: ""` or `name: 123` (fails or is ignored per validation rules).

- [x] 3.3 Update import apply logic: on Replace (anonymous tier), if the imported file carries a `name`, update the profile's name; if `name` is absent, derive from `aircraft.model` (fall back to `"Imported profile"`). Verify: import a file with a name → profile name updates; import a file without a name → name is derived from the model.

## 4. Backend de-mirroring parity

- [x] 4.1 Update `compute_leg_segments` in `packages/backend/flight_plan.py:398` so that for a bound level leg (regime present, no altitude change or no matching transition data), cruise TAS and FF come from `regime['cruise']` instead of the waypoint's `tas`/`ff`. Verify: run the backend test suite (`cd packages/backend && python -m pytest`) and confirm it passes; add a test that a bound level leg uses the regime's cruise values, not the waypoint's.

- [x] 4.2 Verify backend kneeboard parity: the frontend marshals `aircraft` (including regimes) into the plan body for the kneeboard endpoint, so the backend receives regimes. After 4.1, the backend resolves bound-leg values identically to the frontend. Verify: generate a kneeboard for a plan with regime-bound legs and confirm printed times/fuels match the frontend display.

## 5. Full verification

- [x] 5.1 Run `pnpm --filter frontend exec vitest run` and confirm the full test suite passes with no pre-existing test broken
- [x] 5.2 Run `pnpm --filter frontend exec tsc --noEmit` and confirm a clean type-check
- [x] 5.3 Run `openspec validate extract-performance-profiles --type change --strict` and confirm it passes
- [x] 5.4 Exercise the app end-to-end: create a plan with waypoints, add a regime with cruise TAS/FF, bind several legs, edit the regime's cruise values and confirm legs update immediately without a page refresh. Then export the profile, verify `name` appears in the file. Import it back, confirm name and aircraft data are restored. Finally, directly edit TAS on a bound leg and confirm it reverts to Manual. Verify: all operations succeed without console errors.
- [x] 5.5 Record that signed-in tier scenarios (profile CRUD, collection, `profileId`, switching, deletion, selection split, sign-in adoption) are specified but not implementable until `add-user-accounts` and server-backed storage land — the gap is visible rather than silently unticked
