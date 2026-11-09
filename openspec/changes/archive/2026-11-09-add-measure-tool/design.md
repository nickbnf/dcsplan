# Design

## Context

See proposal.md for the motivation and specs/map-measure/spec.md for the behaviour. Current state:

- `PlannerApp` owns the two modes that measuring must cancel: waypoint drawing (`useDrawing`: `startDrawing`/`stopDrawing`, `drawingState.isDrawing`) and add-marker placement (`isAddMarkerMode`). It passes both to `MapComponent` as props.
- `Map.tsx` installs its OpenLayers `click` and `pointermove` handlers in effects that re-register on dependency changes, and reads volatile modes through refs (`isAddMarkerModeRef`, `activeTabRef`) to avoid stale closures. The click handler tests modes in a fixed order, starting with add-marker mode.
- `Map.tsx` has one global `keydown` handler for coordinate entry, `+`/`-` cycling and `Esc`. It already ignores keys while an input or textarea has focus, and coordinate entry swallows every key while it is open. Undo/redo shortcuts are handled separately in `useUndoShortcuts`.
- Leg courses use `calculateBearing` and `calculateDistanceM` with the **theatre's** navigation settings (`useTheatreNavigation`), never the displayed map's, and convert to magnetic as `true − declination` (`leg-geometry` spec).
- `/p/:id/:slug` → `PlannerApp` is not keyed by plan id, so switching plans keeps `MapComponent` mounted. Switching to the Perf or Attack sub-route unmounts it.
- `DisplayControls` (shared by `Map.tsx` and `LibraryMap.tsx`) has a Measure switch whose `measureEnabled` state is never read.

## Goals / Non-Goals

**Goals:**
- Keep the measure logic out of `Map.tsx` as far as practical. The component is already about 940 lines and manages several modes.
- Use exactly the leg computation, so the "matches a straight leg" scenario holds by construction.
- No React re-render of the whole map per pointer move beyond what the hover readout already causes.

**Non-Goals:**
- A generic "map tool" framework for future tools. One tool does not justify one.
- Making the hook reusable on `LibraryMap`.

## Decisions

### D1. Measure state lives in `Map.tsx` through a `useMeasureTool` hook, not in `PlannerApp`
The hook owns the phase (`idle | armed | rubberband | pinned`), points A and B in map coordinates, a dedicated `VectorLayer`, and the readout overlay. `Map.tsx` wires it into its existing click, move and keydown handlers.

*Alternative:* lift the phase into `PlannerApp` next to the other modes. Rejected: the geometry, layer and overlay are OpenLayers objects bound to the map instance, and `PlannerApp` has no business knowing about them. Only the arm event needs to cross the boundary (D3).

### D2. Phase mirrored in a ref; the click handler checks measure first
Following the `isAddMarkerModeRef` pattern, the hook exposes a `phaseRef`. The click handler gets a new step 0: if the phase is `armed` or `rubberband`, set A or B and `return`, before the add-marker, object, ghost and waypoint hit-tests. In `pinned` and `idle` the handler continues as today, which gives "pinned → normal interaction". The pointer-move handler updates the rubber-band geometry directly on the OL feature and updates the readout only in `rubberband`. The cursor is a crosshair in `armed` and `rubberband`.

### D3. Mode cancellation: callback up, effect down
- **Arming cancels other modes:** `MapComponent` gets a new prop, `onMeasureArm`. `PlannerApp` implements it as `stopDrawing(null); setIsAddMarkerMode(false)`, matching what `handleTabChange` already does.
- **Other modes cancel an in-progress measurement:** the hook watches `drawingState.isDrawing === 'NEW_POINT'` and `isAddMarkerMode`. When either becomes true while the phase is `armed` or `rubberband`, it resets to `idle`. A `pinned` measurement is left alone.

*Alternative:* lift a single "active map mode" enum into `PlannerApp`. That's cleaner long term, but it rewrites the existing drawing/marker plumbing for no user-visible gain.

### D4. Keyboard handling inside the existing global handler
`m`/`M` toggles the tool and `Esc` steps back one phase (`rubberband → armed → idle`, `pinned` unaffected). Both go into `Map.tsx`'s keydown handler *after* the coordinate-entry branches and the input-focus guard. Coordinate entry therefore takes precedence, and typing in comments is unaffected. `Esc` is checked against the measure phase before the existing deselect behaviour, so pressing `Esc` while measuring does not also clear the waypoint selection.

### D5. Computation: reuse leg functions on lat/lon with theatre navigation
A and B are stored in map-projection coordinates, transformed to lat/lon, and fed to `calculateBearing` and `calculateDistanceM` with the theatre's `navigationMode` and projection. Magnetic = `(true − flightPlan.declination + 360) % 360`. The readout is derived on render from these inputs plus the current declination, so declination edits update it for free.

The **reciprocal** is computed as `calculateBearing(B → A)`, not `bearing + 180`. In geographic mode over long distances these differ, and the bearing back from B is what the user actually wants. In projected mode the two are identical.

Formatting: `Math.round(deg) % 360` zero-padded to 3 digits (as `formatHdg` in `AttackPlanningPage`), and NM to one decimal place.

### D6. Rendering
- **Line:** the shared construction-line style `PREVIEW_LINE_STYLES` (in `useDrawing.ts`), also used by the waypoint-drawing preview line, so the two look identical and neither looks like a route leg. The style is a dashed deep-orange stroke (`#E65100`) over a 50 % transparent white halo, for contrast on busy charts without hiding them. A small hollow circle marks A and an arrowhead marks B, rotated by the projected segment angle, so A → B reads as a vector.
- **Readout:** an OpenLayers `Overlay` (HTML element) at the segment midpoint, styled like the existing hover tooltip (`bg-gray-900/80`, `font-aero-label`). The reciprocal is a dimmer span. HTML is used instead of an OL `Text` style because Tailwind styling and the subdued secondary part are simpler there, and it matches the other map overlays.
- The measure layer sits above the flight plan and object layers, and is not part of any hit-test.

### D7. Lifetime
- The layer is created with the map, so map changes and remounts (selecting another theatre map, leaving to Perf/Attack, closing the plan, reloading) discard it with the map instance. The hook resets its state when the map instance changes.
- The hook also resets to `idle` when the plan's route id changes, because `PlannerApp` stays mounted across plan switches.
- Nothing touches `flightPlan`, `onFlightPlanUpdate` or Yjs, so undo, versions, sync and the kneeboard are unaffected by construction (AD-6).

### D8. Button
A `MeasureButton` in `components/map/`, styled like `DisplayButton` and stacked directly under it (`top-4 right-4` + one button height + gap). It shows a ruler icon, `aria-pressed` when not `idle`, and the title "Measure bearing / distance (M)".

### D9. Dead switch removal
Remove the `measureEnabled`/`onMeasureChange` props from `DisplayButton` and `DisplayControls` and the state from `Map.tsx` and `LibraryMap.tsx`, and update `DisplayControls.test.tsx`.

## Risks / Trade-offs

- **[Measurement lost when visiting Perf/Attack and coming back]** → Accepted. It counts as leaving the plan view, and the spec only promises persistence while editing on the map. Lifting state above the router would contradict the "ephemeral, local" design.
- **[Click handler re-registration races]** The click effect re-registers on many dependencies; a stale closure could miss the measure phase. → Read the phase only through `phaseRef`, never from closure state.
- **[Esc ordering regressions]** Adding a branch to the shared keydown handler could change existing `Esc` behaviour. → Tests for `Esc` with: coordinate entry open, measure in progress, measure pinned plus waypoint selected.
- **[Collision between `M` and future shortcuts]** → `M` is currently free. Coordinate entry uses N/S/E/W and digits only.
- **[Projected vs geographic drawing]** In geographic mode the drawn straight line is a projected segment, not a great circle, while the numbers are great-circle values. → This is the same compromise legs already make, so the measurement is consistent with legs drawn on the same map.
