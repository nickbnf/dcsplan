# Performance Data — Lifecycle Alignment with Library

## Context

Today, performance data (the `Aircraft` block: model, takeoff configuration, taxi fuel, takeoff performance, regimes) lives **inside** `FlightPlan.aircraft`. As a result, clicking **Clear** on the flight plan calls `flightPlanUtils.newFlightPlan(theatre)`, which builds a fresh `defaultAircraft()` and **wipes the user's regimes and aircraft profile**. This is the wrong lifecycle: a user typically defines their aircraft profile once and reuses it across many plans.

The `Library` (theatre objects) already gets this right: it lives in its own React context (`LibraryContext`), its own localStorage key (`dcsplan.library.${theatre}`), and is **never touched** when the flight plan is cleared. Theatre changes can clear it, but that's a separate explicit user action.

**Goal:** extract `Aircraft` out of `FlightPlan` into an independent state container that mirrors the Library pattern, so performance data survives flight plan clears, exports, and imports.

**User decisions (already taken):**
- Performance is stored under a **single global key** `dcsplan.performance` (one current aircraft profile — *not* keyed by theatre or model). This is the one structural deviation from the Library, which is per-theatre.
- Flight plan files **embed `performanceSnapshot: Aircraft`** alongside `librarySnapshot`, so files stay self-contained. On import, performance is **replaced** (not merged — there's only one profile).

## Pattern to mirror

The Library pattern, in 3 pieces:

| Piece | Library | Performance (new) |
|---|---|---|
| Storage utils | `utils/libraryStorage.ts` | `utils/performanceStorage.ts` *(new)* |
| React context + hook | `contexts/LibraryContext.tsx` → `useLibrary()` | `contexts/PerformanceContext.tsx` → `usePerformance()` *(new)* |
| Provider wiring | `<LibraryProvider>` inside `<FlightPlanProvider>` | `<PerformanceProvider>` *outside* `<FlightPlanProvider>` (independent) |

## Design

### 1. New file — `packages/frontend/src/utils/performanceStorage.ts`

Single global key, no theatre param. Exports:

- `PERFORMANCE_STORAGE_KEY = 'dcsplan.performance'`
- `loadPerformance(): Aircraft` — load + validate; return `defaultAircraft()` on miss/invalid.
- `savePerformance(aircraft): void` — trap `QuotaExceededError`/`SecurityError` like `saveLibrary`.
- `clearPerformance(): void`
- `hasStoredPerformance(): boolean` — used by the bootstrap to avoid clobbering an existing profile.
- `parseAircraftBlock(unknown)`  → `{ ok, aircraft } | { ok: false, errors }` — shared validator used by both `.perf.json` import and embedded `performanceSnapshot`. Extract from the existing `validatePerformancePackage` (`utils/performanceImport.ts`).

### 2. New file — `packages/frontend/src/contexts/PerformanceContext.tsx`

Mirrors `LibraryContext.tsx`, but with no `useFlightPlan()` dependency and no theatre `useEffect`. Surface:

```ts
interface PerformanceContextValue {
  performance: Aircraft;
  setPerformance: (a: Aircraft) => void;
  updateAircraft: (patch: Partial<Aircraft>) => void;
  addRegime: (r: Regime) => void;
  updateRegime: (id: string, updates: Partial<Regime>) => void;
  deleteRegime: (id: string) => void;
  clearAll: () => void;
}
```

Initial state: `useState(() => loadPerformance())`. Auto-save effect on mutation, identical shape to `LibraryProvider`'s save effect.

### 3. Type changes — `packages/frontend/src/types/flightPlan.ts`

- **Remove** `aircraft: Aircraft` from `FlightPlan`.
- **Keep** `Aircraft`, `Regime`, `TakeoffPerformance`, `defaultAircraft()`, `PerformanceFileV1`, `PERFORMANCE_FILE_VERSION` — still used by the new module.
- **Keep** `FlightPlanTurnPoint.regimeId?: string` — only the lookup source moves.
- **Bump** `FLIGHT_PLAN_VERSION = "1.5"`.
- **Extend** `VersionedFlightPlan` with `performanceSnapshot?: Aircraft`.

### 4. Storage migration (the critical landmine)

Old localStorage `dcsplan-flightplan` (v1.4 and earlier) has `flightPlan.aircraft` inline. After this change, the validity check in `usePersistedFlightPlan.ts` will reject those payloads if `aircraft` becomes required-absent. The migration must run **synchronously before React mounts**, otherwise `PerformanceProvider`'s initial `useState(() => loadPerformance())` reads an empty key while the flight-plan load effect is still spinning up.

**Bootstrap function** in a new module `utils/legacyMigration.ts`, called from `main.tsx` *before* `createRoot().render()`:

```
bootstrapPerformanceFromLegacyPlan():
  1. Read localStorage['dcsplan-flightplan']. Bail if missing/malformed.
  2. If parsed.flightPlan.aircraft exists AND !hasStoredPerformance():
       savePerformance(parsed.flightPlan.aircraft)
  3. Delete parsed.flightPlan.aircraft (and any top-level legacy `regimes` field).
  4. Write back as { version: '1.5', flightPlan: parsed.flightPlan }.
```

The "non-clobber" rule (step 2's `!hasStoredPerformance()` guard) means a user who has already imported a profile won't lose it when reloading an old plan file from another browser.

### 5. Provider wiring — `packages/frontend/src/components/App.tsx`

Move `PerformanceProvider` to the **outermost** position to express that it's data-independent from the flight plan:

```jsx
<PerformanceProvider>
  <FlightPlanProvider>
    <LibraryProvider>
      <Layout />
    </LibraryProvider>
  </FlightPlanProvider>
</PerformanceProvider>
```

### 6. Regime-ID consistency on waypoints

Today, `usePersistedFlightPlan.ts:93–101` strips `regimeId` from waypoints whose ID doesn't appear in `aircraft.regimes`. After the split, performance isn't loaded yet at flight-plan-load time. Replace with a small `<RegimeConsistencyGuard />` component mounted inside `Layout`, which uses both `useFlightPlan()` and `usePerformance()` and runs a `useEffect` keyed on `performance.regimes` that drops unknown `regimeId`s.

### 7. File-by-file change contract

| File | Change |
|---|---|
| `types/flightPlan.ts` | Drop `FlightPlan.aircraft`; bump version to `"1.5"`; add `performanceSnapshot?` to `VersionedFlightPlan`. |
| `utils/performanceStorage.ts` *(new)* | See §1. |
| `contexts/PerformanceContext.tsx` *(new)* | See §2. |
| `utils/legacyMigration.ts` *(new)* | `bootstrapPerformanceFromLegacyPlan()` — see §4. |
| `main.tsx` | Call bootstrap synchronously before `createRoot().render()`. |
| `components/App.tsx` | Wrap with `<PerformanceProvider>` outside `<FlightPlanProvider>`; mount `<RegimeConsistencyGuard />` inside `Layout`. |
| `hooks/usePersistedFlightPlan.ts` | Drop `aircraft` from validity check; drop the v1.2→v1.3 aircraft synthesis; drop the regimeId-stripping pass (moved to guard); bump expected version to `"1.5"`. |
| `utils/flightPlanUtils.ts` | `newFlightPlan()`: remove `aircraft: defaultAircraft()`. `downloadAircraft(aircraft)`: change signature to take `Aircraft` directly (not flight plan). `downloadFlightPlan(flightPlan, library, performance)`: add third arg, embed as `performanceSnapshot`. |
| `utils/legCalculations.ts` (645, 727, 740) | Add `aircraft: Aircraft` parameter to `calculateAllLegData`; replace `flightPlan.aircraft?.*` reads with the parameter. |
| `utils/regimeUtils.ts` | No changes — already mutates only `points`. |
| `components/PerformancePage.tsx` | Replace every `flightPlan.aircraft.*` with `performance.*` from `usePerformance()`; replace `onFlightPlanUpdate({ ...flightPlan, aircraft: ... })` with the context's mutators. For cruise propagation/delete, still call `propagateRegimeCruiseChange`/`clearRegimeFromAllWaypoints` then `onFlightPlanUpdate`. Export: `downloadAircraft(performance)`. |
| `components/PerformanceImportDialog.tsx` | Drop `onFlightPlanUpdate` prop; on Replace call `setPerformance(validated)` + walk `flightPlan.points` to strip unknown `regimeId`s via `onFlightPlanUpdate`. |
| `components/sidebar/FlightPlanZone.tsx` (625, 663, 674) | Replace `flightPlan.aircraft.regimes` with `performance.regimes` from `usePerformance()`. |
| `components/Sidebar.tsx` | In `ImportFlightPlanDialog` wiring, add `onPerformanceSnapshot={snapshot => setPerformance(snapshot)}` and pass `currentPerformance` for the dialog's preview. Also pass `performance` to `downloadFlightPlan`. |
| `components/sidebar/ImportFlightPlanDialog.tsx` | Extract `performanceSnapshot` alongside `librarySnapshot`. Validate via `parseAircraftBlock`. Show a "Performance profile in file: <model> · N regimes — your current profile will be replaced" panel. Wire `onPerformanceSnapshot`. **Wire-format marshaling**: before posting to backend, recombine `flightPlan.aircraft = performanceSnapshot ?? defaultAircraft()`; backend still validates the combined shape. After response, strip `aircraft` back off when handing to `onImport`. |
| `utils/performanceImport.ts` | Refactor so its body delegates to the new `parseAircraftBlock` in `performanceStorage.ts`. |
| `backend/flight_plan.py` | **No structural change.** Backend keeps `FlightPlan.aircraft` as-is — frontend marshals at the wire boundary. Keep the existing v1.2 validator. |
| `backend/main.py` | Add `"1.4"` and `"1.5"` to `SUPPORTED_VERSIONS` in the import endpoint. The frontend re-combines `performanceSnapshot` into `flightPlan.aircraft` before posting, so no backend schema change is needed. |

**Note on backend scope:** the user is asking about an in-memory/lifecycle question, not an API contract. Keeping `FlightPlan.aircraft` on the wire (with the frontend marshaling at the boundary) is the smallest blast radius. A follow-up change can split the backend symmetrically later if it becomes worthwhile.

### 8. Tests

- **Update**: frontend tests that construct a `FlightPlan` literal with `aircraft: defaultAircraft()` — drop the field. `flightPlanUtils.test.ts`, `flightPlanSnapshot.test.ts`, `regimeUtils.test.ts`, `legCalculations.test.ts`, `usePersistedFlightPlan.test.tsx`, `PerformancePage.test.tsx`, `PerformanceImportDialog.test.tsx`, `performanceImport.test.ts`. Pass an explicit `aircraft` to `calculateAllLegData` where exercised.
- **Replace**: `usePersistedFlightPlan` migration tests for v1.2→v1.3 — now belong to `legacyMigration.test.ts` (new). Add cases: legacy plan with aircraft + no stored performance → migrates; legacy plan with aircraft + existing stored performance → does **not** clobber; legacy plan without aircraft → no-op.
- **Add**: `performanceStorage.test.ts` (load/save/clear, quota-exceeded), `PerformanceContext.test.tsx` (CRUD), integration assertion in flight-plan export tests that `performanceSnapshot` is embedded and round-trips.

### 9. Verification (manual)

1. Fresh localStorage. Open `/performance`, add 2 regimes ("Mil cruise", "Idle descent"), set model = `F-15E`, taxi fuel = 500.
2. DevTools → Application → Local Storage: confirm `dcsplan.performance` is populated; `dcsplan-flightplan` has no `aircraft` field.
3. `/`, place 4 waypoints, bind "Mil cruise" to one leg.
4. Click **Clear**. Route empties.
5. `/performance` — both regimes and the model still present. **Core goal.**
6. Reload. State still preserved.
7. **Export** the flight plan; open the JSON: confirm `version: "1.5"` and a `performanceSnapshot` block.
8. **Backwards-compat**: in a clean profile, seed localStorage with a saved v1.4 payload (aircraft block + one regime). Reload. Regime appears under `/performance`; `dcsplan.performance` now populated.
9. **Non-clobber**: with a non-default `dcsplan.performance` already in localStorage *and* a legacy v1.4 `dcsplan-flightplan`, reload. The existing profile is preserved (not overwritten).
10. **Import a v1.5 plan** with a different `performanceSnapshot` — confirm the dialog warns about replacement and that confirming swaps the global profile.

### Landmines

- **`isValidFlightPlan` check on `data.aircraft`** in `usePersistedFlightPlan.ts:22–24` will silently wipe persisted plans on first load with the new version if not updated first.
- **`calculateAllLegData` signature change** ripples through `flightPlanUtils.calculateAllLegData`, `FlightPlanZone`, `Map`, overlay components — grep `calculateAllLegData(` exhaustively before declaring done.
- **Migration ordering** — the synchronous `main.tsx` bootstrap is non-negotiable. If anyone moves it to a `useEffect`, regimes will look missing on first paint and the regime-consistency guard will wrongly strip waypoint bindings.
- **`flightPlanSnapshot.test.ts`** asserts `FLIGHT_PLAN_VERSION === "1.4"` somewhere — bump.
- **`backend/waypoint_list_page.py:132`** reads `flight_plan.aircraft.model` — fine because the wire format keeps `aircraft` inline, but a future symmetric backend split would have to revisit this.
