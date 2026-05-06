## 1. Data model

- [x] 1.1 Add a `Regime` interface to `packages/frontend/src/types/flightPlan.ts` with `id`, `name`, `comment?`, `cruise`, `climb?`, `descent?` per design §1, and add a small JSDoc clarifying that `climb` describes climbing UP TO the regime's cruise altitude and `descent` describes descending DOWN TO it
- [x] 1.2 Add `regimes: Regime[]` to the `FlightPlan` interface
- [x] 1.3 Add optional `regimeId?: string` to `FlightPlanTurnPoint` and `FlightPlanPointChange`
- [x] 1.4 Bump `FLIGHT_PLAN_VERSION` to `"1.2"`
- [x] 1.5 Check the codebase for an existing short-id helper (utils, hooks); reuse it if present, otherwise add `generateRegimeId()` returning a short opaque random string (e.g. 8-char slice of `crypto.randomUUID()`)

## 2. Leg computation algorithm (frontend, canonical)

- [x] 2.1 Locate the current `LegData` derivation and the existing wind-aware `applyWind(tas, wind, course)` helper; note the call sites that consume `LegData`
- [x] 2.2 Add a pure function `computeLegSegments({ prevAlt, legAlt, distance, course, windA, windB }, regime?)` returning a discriminated union: `{ kind: 'level', tas, ff }`, `{ kind: 'segmented', transition: { phase, time, distance, fuel }, cruise: { time, distance, fuel } }`, or `{ kind: 'warning', reason: 'transition-too-long', reachableAltDelta, transitionDistance }`
- [x] 2.3 Wire `computeLegSegments` into the existing leg-derivation path; compute total leg time and fuel by summing segment contributions
- [x] 2.4 Implement the reachable-altitude formula (`reachableAltDelta = roc * (D / transitionGroundSpeed) * 60`) and the TOC/TOD lat/lon along the great-circle path (reuse the existing intermediate-point helper if present)
- [x] 2.5 Add unit tests in `flightCalculations.test.ts` (or alongside the function): level leg manual, level leg with regime, climb with full data, climb without data falls back to cruise, descent with full data, descent without data, manual leg with alt delta, over-long climb fires warning, over-long descent fires warning, level leg with no regime unchanged from pre-feature

## 3. Persistence and migration

- [x] 3.1 Update `usePersistedFlightPlan` to recognise `version === "1.1"` and synthesise `regimes: []`
- [x] 3.2 On load, walk waypoints and clear any `regimeId` that doesn't match a regime in the plan's `regimes` collection
- [x] 3.3 Set in-memory version to `"1.2"` so the next save writes the new format
- [x] 3.4 Add migration tests using a v1.1 fixture: missing `regimes` becomes `[]`, missing `regimeId` stays absent, orphan `regimeId` is cleared, the next persisted JSON has `version: "1.2"`

## 4. Regime sync helpers

- [x] 4.1 Add `applyRegimeToWaypoint(waypoint, regime)` that sets `regimeId` and writes the regime's cruise TAS/FF onto the waypoint
- [x] 4.2 Add `clearRegimeBinding(waypoint)` that clears `regimeId` and leaves `tas` / `fuelFlow` in place
- [x] 4.3 Add `propagateRegimeCruiseChange(plan, regime)` that walks every waypoint with `regimeId === regime.id` and writes the new cruise values
- [x] 4.4 Add `clearRegimeFromAllWaypoints(plan, regimeId)` used on regime deletion (clears the binding, retains last TAS/FF)
- [x] 4.5 Unit tests for all four helpers

## 5. Performance page UI

- [x] 5.1 Replace the placeholder content in `PerformancePage.tsx` with a list–detail layout: 400 px sidebar listing regimes (with a `+ Add regime` button at the top), main pane showing the editor for the selected regime
- [x] 5.2 List items show the regime name plus small badges when `climb` and/or `descent` are filled
- [x] 5.3 Wire `+ Add regime` to push a new regime with a unique default name (`Regime 1`, `Regime 2`, ...) and select it for editing
- [x] 5.4 Build the editor form: name input, comment textarea, Cruise section (TAS, FF), Climb section with header **"Climb up to this regime"** (TAS, FF, ROC), Descent section with header **"Descent down to this regime"** (TAS, FF, ROD); use existing `EditableField` styling for numeric inputs
- [x] 5.5 Implement live validation: name required and unique (case-sensitive) with inline error; cruise TAS and FF positive; climb section all-or-nothing; descent section all-or-nothing
- [x] 5.6 On cruise TAS or FF change, call `propagateRegimeCruiseChange` after save
- [x] 5.7 Implement delete: if the regime is unreferenced, single-step confirm; if referenced by N waypoints, dialog reading "This regime is used on N legs. Deleting will revert them to Manual." On confirm, call `clearRegimeFromAllWaypoints` then remove the regime
- [x] 5.8 Component tests covering: add, rename (preserves id), reject duplicate name, propagation on cruise edit, delete unreferenced, delete referenced (confirm flow + waypoint binding cleared), all-or-nothing validation on both sections

## 6. Leg row UI (`RouteCard`)

- [x] 6.1 Extend `RouteCard` to render a regime picker on the leg header row when `plan.regimes.length > 0`; hide it entirely when no regimes exist (visual diff vs. pre-feature: zero)
- [x] 6.2 Picker shows `—` for Manual, regime name when bound; opens a dropdown listing all regimes plus a final `— Manual —` entry
- [x] 6.3 Selecting a regime calls `applyRegimeToWaypoint` on the destination waypoint; selecting `— Manual —` calls `clearRegimeBinding`
- [x] 6.4 Update the TAS and FF `EditableField` commit handlers to also call `clearRegimeBinding` on commit (only when the value actually changed)
- [x] 6.5 Confirm the alt and wind `EditableField` commit handlers do NOT call `clearRegimeBinding` (regression test)
- [x] 6.6 Render `↗` / `↘` glyph next to the altitude cell based on `sign(legAlt - prevAlt)`; no glyph when level
- [x] 6.7 Add a tooltip on the glyph: for regime-driven legs with transition data, show the segment breakdown (transition: time/distance/fuel; cruise: time/distance/fuel); for Manual mode or fallback-to-cruise legs, show only altitude delta and leg distance
- [x] 6.8 Render a non-interactive `⚠ Fix` indicator on the leg row when `computeLegSegments` returns `{ kind: 'warning' }`; the indicator shows the same tooltip as the climb/descent glyph (transition distance vs. available distance)
- [x] 6.12 Component tests: picker visibility (hidden / shown / states), direct-edit-clears-regime for TAS and FF, alt and wind preserve binding, glyph rendering for climb/descent/level, warning indicator visible and non-interactive

## 7. Backend (Python / Pydantic)

- [x] 7.1 Add a `Regime` Pydantic model and `regimes: list[Regime]` (default `[]`) to the flight plan model
- [x] 7.2 Add `regimeId: str | None = None` to the waypoint model
- [x] 7.3 Mirror `computeLegSegments` in Python, named `compute_leg_segments`, matching the TS algorithm exactly (same input shape, same return discriminator, same wind-handling per design §4)
- [x] 7.4 Wire `compute_leg_segments` into the existing kneeboard leg-time / leg-fuel computation
- [x] 7.5 Verify the kneeboard renderer does not emit regime names or any regime-specific identifiers (audit existing draw calls)
- [x] 7.7 Add `prev_alt` to `LegData`; in `draw_doghouse` and `draw_mini_doghouse`, prepend `↑` when `alt > prev_alt` and `↓` when `alt < prev_alt` to the altitude string in the doghouse
- [x] 7.6 Pytest covering the same scenario set as the TS unit tests (mirrored fixtures from §8.1)

## 8. Frontend / backend parity

- [x] 8.1 Create a shared JSON fixture set at a top-level location (e.g. `packages/shared/leg-calc-fixtures/` or `tests/fixtures/leg-calc/` — pick whatever fits the monorepo) with input → expected-output pairs covering: level manual, level regime, climbing leg full data, climbing leg cruise fallback, descending leg full data, descending leg cruise fallback, over-long climb (warning), over-long descent (warning), legacy v1.1 plan
- [x] 8.2 Add a TS contract test that loads the fixtures and asserts `computeLegSegments` output matches the expected payload exactly (within a small float tolerance)
- [x] 8.3 Add a Python contract test loading the same fixtures and asserting `compute_leg_segments` matches the same expected output
- [x] 8.4 Confirm both tests run in the existing CI workflow (TS via `pnpm test`, Python via the existing pytest invocation)

## 9. Smoke tests and verification

- [x] 9.1 Run the dev server, define a regime in the Perf page, apply it on a leg, change the leg's altitude to force a climb; verify the `↗` glyph appears, the tooltip shows the segment breakdown, and the leg fuel matches a hand-computed value within ±2%
- [x] 9.2 Provoke a long-climb warning by setting an unreachable destination altitude on a short leg; verify the `⚠ Fix` indicator appears with the correct tooltip (transition distance vs. available distance) and does not trigger any update on click
- [x] 9.3 Load a pre-existing v1.1 plan (use one of the existing test plans); verify the leg row UI is visually identical to before the feature, the picker is hidden, and a save round-trips to v1.2 cleanly
- [x] 9.4 Generate a kneeboard for a plan that uses regimes; verify printed leg times and fuel match what the planning UI shows, and confirm no regime names, glyphs, or indicators appear on any page
- [x] 9.5 Run `openspec validate performance-regimes --strict` (or equivalent) and `pnpm typecheck` / `pnpm test` / the backend test suite all pass before requesting review
