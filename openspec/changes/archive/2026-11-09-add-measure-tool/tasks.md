# Tasks

## 1. Remove the dead Measure switch

- [x] 1.1 Remove `measureEnabled`/`onMeasureChange` from `DisplayButton.tsx` and `DisplayControls.tsx`, and the unused `measureEnabled` state from `Map.tsx` and `LibraryMap.tsx`. Update `DisplayControls.test.tsx` and add an assertion that no "Measure" switch is rendered. Verify with `pnpm --filter frontend test DisplayControls` and `pnpm --filter frontend exec tsc --noEmit`

## 2. Pure measure logic (spec: Readout format, Measurement matches leg computation, Cancelling and dismissing)

- [x] 2.1 Add `utils/measure.ts` with `computeMeasurement(a, b, navigation, declination)`. It returns the magnetic A → B bearing, the distance in NM, and the magnetic B → A bearing, using `calculateBearing`/`calculateDistanceM` and the `leg-geometry` sign convention (design D5). Verify with `utils/measure.test.ts`: for a two-waypoint plan with non-zero declination, the result equals the leg's magnetic course and straight distance from `legCalculations`, in both geographic and projected modes, and the reciprocal is the true B → A bearing rather than +180
- [x] 2.2 Add `formatMeasurement()` to `utils/measure.ts`. It returns the primary text (`087°M  23.4 NM`) and the secondary text (`(267°M)`): bearings rounded to 3 zero-padded digits with 360 shown as `000`, NM to one decimal place. Verify with unit tests covering the spec's readout scenarios (87.4/23.44/267.4 and 359.6 → `000°M`)
- [x] 2.3 Add a pure phase reducer `measureReducer(state, event)` with phases `idle | armed | rubberband | pinned` and events `toggle`, `click(coord)`, `escape`, `otherModeStarted`, `reset` (design D1–D4, D7). Verify with unit tests for every transition in the spec's Cancelling-and-dismissing and Interaction-with-other-map-modes scenarios, including: Esc in `rubberband` → `armed`, Esc in `pinned` is a no-op, toggle in `pinned` → `idle`, and `otherModeStarted` in `pinned` keeps the measurement

## 3. Map integration (spec: entry points, placing, persistence, lifetime)

- [x] 3.1 Add the `hooks/useMeasureTool.ts` hook around `measureReducer`. It exposes `phaseRef` and owns a dedicated `VectorLayer` (dashed line, hollow circle at A, arrowhead at B, excluded from hit-tests) and an `Overlay` readout styled like the hover tooltip, with the reciprocal dimmed (design D2, D6). It resets when the map instance or the plan route id changes (D7). Verify with `pnpm --filter frontend exec tsc --noEmit` and by running the app: a measurement draws as described
- [x] 3.2 Add `components/map/MeasureButton.tsx`, stacked under the Display button, with a ruler icon, `aria-pressed` when not idle, and the title "Measure bearing / distance (M)" (design D8). Verify with `MeasureButton.test.tsx`: clicking calls the toggle callback and `aria-pressed` reflects the prop
- [x] 3.3 Wire the hook into `Map.tsx`: measure is step 0 in the click handler (only `armed`/`rubberband` consume clicks), the rubber band updates in the pointer-move handler, and the cursor is a crosshair while measuring. Verify in the running app: clicking a waypoint while armed places a point without selecting it, and after pinning, clicks select and drag waypoints normally while the measurement stays
- [x] 3.4 Add `m`/`M` and the measure `Esc` branch to `Map.tsx`'s global keydown handler, after the coordinate-entry branches and the input-focus guard, with measure `Esc` taking precedence over deselect (design D4). Verify in the running app: `m` typed in a comment field is not intercepted, `M` during coordinate entry goes to coordinate entry, Esc with A placed returns to armed without clearing the waypoint selection, and Esc on a pinned measurement does nothing
- [x] 3.5 Add the `onMeasureArm` prop to `MapComponent`, implemented in `PlannerApp` as `stopDrawing(null); setIsAddMarkerMode(false)`. Dispatch `otherModeStarted` from the hook when `NEW_POINT` drawing or add-marker mode starts (design D3). Verify in the running app: arming during waypoint drawing or marker placement cancels them, and starting waypoint drawing discards an in-progress measurement but keeps a pinned one
- [x] 3.6 Add a "Measure tool" section to `docs/release-notes.md` (button, `M`/`Esc`, magnetic readout with reciprocal, not stored or printed, Measure switch removed from Display options). Verify that the section exists and matches the spec

## 4. Integration check

- [x] 4.1 Run `pnpm --filter frontend test` and `pnpm --filter frontend exec tsc --noEmit`, and check that both pass
- [x] 4.2 Manual pass in the running app against the `map-measure` scenarios that unit tests can't cover. Measure between two waypoints and compare with the sidebar leg course and distance. Change the declination with a measurement pinned. Generate a kneeboard and confirm there's no measurement on it. Undo after pinning leaves the measurement in place. Selecting another theatre map clears it. Switching plans and reloading clear it. The theatre library map has no Measure button and doesn't react to `M`

## Workflow follow-up

- The maintainer reviews and commits by hand.
- Archive the change with `/opsx:archive` once implemented and verified.
