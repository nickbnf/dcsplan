# Design

## Context

See `proposal.md` for the three defects and `specs/leg-geometry/spec.md` for the required behaviour. The relevant shape of the code today:

```
 FRONTEND                                               BACKEND (flight_plan.py)
 ────────────────────────────────────────────────       ─────────────────────────────────────
 Map.tsx ── createFlightPlanLayer(plan, proj, nav)      FlightPlanData loop (≈ l.700)
              └─ calculateAllLegDrawData(plan, …)          inbound = legData[-1].heading  ✗
                   radius ← destination.tas      ✗       LegData.__init__ (≈ l.549)
                   inbound ← heading             ✗         radius ← points[to].tas      ✗
                   course  ← true + decl         ✗         course ← bearing + decl      ✗
                                                           heading/arc time ← points[to].tas ✗
 FlightPlanZone ── calculateAllLegData(plan, …, aircraft)
                   (same loop duplicated)        ✗✗✗     kneeboard / overview maps
                   ETE/fuel ← regime TAS         ✓         read LegData (turn centre, straightening pt)
```

- **Two copies of the loop.** The leg loop exists twice in the frontend: `calculateAllLegDrawData` feeds the map, `calculateAllLegData` feeds the sidebar. The two differ only in what they return. The map path receives no `Aircraft`, so it cannot see regimes.
- **Backend formulas.** The backend mirrors the frontend formula for formula, and the kneeboard prints `heading` as `°M` (`map_annotations.py`).
- **Golden tests.** `packages/shared/theatre-golden/plans.json` has three fixture plans, all with a non-zero declination (3, 5, 6). Both `theatreGolden.test.ts` and `test_theatre_golden.py` assert course, heading, turn centre, straightening point, distance, ETE, and fuel against `frontend-expected.json` and `backend-expected.json`. Both files will change.

## Goals / Non-Goals

**Goals:**
- One frontend function computes leg geometry. The map and the sidebar both use it, so the drawing and the numbers cannot disagree.
- The effective TAS is resolved in one place and used for the turn radius, the heading, and ETE/fuel alike.
- The golden fixtures are regenerated deliberately, with the change in values explained.

**Non-Goals:**
- Changing `calculateStraighteningPoint` / `calculate_straigthening_point` themselves. Their maths is correct; only their `inboundBearing` and radius inputs change.
- Reworking the backend's leg class structure beyond the input fixes.
- Departure geometry for the first leg (`runway-departure`). This design only leaves a seam for it.

## Decisions

### D1. Single frontend leg-geometry pass

Extract one function, for example `computeLegGeometries(plan, aircraft, projection, mode)`. For each leg it returns: effective TAS, turn radius, inbound bearing (true), turn centre, straightening point, turn direction, turn angle, outbound bearing (true), magnetic course, and heading. Then:
- `calculateAllLegDrawData` becomes a mapping over its result.
- `calculateAllLegData` consumes it and adds the regime/ETE/fuel/EFR chain.

*Alternative considered:* fix the three bugs in both loops in place. It is a smaller diff, but it keeps two copies that must change together. That is exactly how the map and sidebar could drift apart, and `runway-departure` would have to change both again. Rejected.

### D2. The map receives the resolved profile

`createFlightPlanLayer` gains an `aircraft: Aircraft` parameter. `Map.tsx` reads it with `usePerformance()`, the same source `FlightPlanZone` uses, and keeps it in a ref like `flightPlanRef` / `navigationRef`. The layer is rebuilt when the profile changes, as well as when the plan changes, so editing a regime's cruise TAS redraws the turns (spec scenario "Changing the regime's cruise TAS reshapes the turn").

*Alternative considered:* resolve the effective TAS on the waypoints before passing the plan to the layer (a "view plan"). This hides the dependency and risks the resolved value leaking back into the Y.Doc. Rejected.

### D3. One effective-TAS helper per side

- **Frontend:** `effectiveTas(destination, aircraft)` returns the regime cruise TAS when `regimeId` resolves, otherwise `destination.tas`. It lives next to the existing regime helpers in `regimeUtils.ts`. `FlightPlanZone`'s `displayTas` switches to it as well, so the sidebar and the calculations share one definition.
- **Backend:** an equivalent `_effective_tas(point, aircraft)` in `flight_plan.py`, used for the turn radius, the heading, and `time_to_straightening_s`.

### D4. Inbound bearing = previous outbound bearing (true)

In the shared pass, the inbound bearing for leg *i* is leg *i−1*'s `outboundBearing`: the bearing from its straightening point to its destination, in the navigation mode's frame. The backend does the same, using the leg's bearing (already computed before `course`) instead of `heading`. The backend `LegData` stores that bearing as a field, so the loop does not have to derive it back from `course`.

### D5. Course and heading formulas

- `course = (outboundBearing − declination + 360) % 360` at the single frontend site (D1) and in `LegData`.
- **Heading wind correction.** The existing formula divides the crosswind by **ground speed**: `asin(cross / (tas + tail))`. The textbook wind triangle uses **TAS**: `sin(WCA) = crosswind / TAS`. The spec requires "corrected for the destination wind at the effective TAS", so both sides switch to `asin(cross / effectiveTas)`, and to `effectiveTas` for the arc ground speed. For typical winds the difference is under a degree, but it grows with strong head- or tailwind components.

### D5b. Wind against the true course

`windDir` is true (spec "Wind direction is true"). `LegGeometry` exposes the true course (`outboundBearing`), and every wind consumer receives it:
- `computeLegSegments`: its `course` input becomes the true course;
- the level-cruise `applyWind` in `calculateAllLegData`;
- the heading.

The heading's wind correction angle is computed on the true course and then converted to magnetic by subtracting the declination. The backend mirrors this, passing `bearing` instead of `self.course` to `compute_leg_segments`, `apply_wind`, and the heading. `applyWind` / `apply_wind` themselves are unchanged: they are frame-agnostic, provided the wind and the course are in the same frame.

*Alternative considered:* convert `windDir` to magnetic before use. This is equivalent, but spreads `declination` into every call site. Rejected.

### D6. Golden fixtures are regenerated, not loosened

Run `UPDATE_GOLDEN=1` (backend) and the frontend equivalent once, after all fixes land. Review the diff:
- course and heading shift by about −2 × declination, plus the D5 change;
- turn centres, straightening points, distances, ETE, and fuel shift slightly at every turn.

Tolerances stay as they are. No test compares the frontend and backend expected files with each other. A manual comparison after regeneration showed:
- courses and headings agree to 1e-9;
- leg distances differ by up to about 0.075 NM on turning legs, with ETE differing by up to 1 s and fuel by up to about 1.3 lbs.

That distance difference was already present before this change, at the same size. It comes from how the turn angle is measured in geographic mode (from bearings on the frontend, from the turn centre in projected coordinates on the backend), and is out of scope here.

### D7. Test strategy

- **Unit, both sides:**
  - Smooth join: the arc's start tangent equals the previous outbound bearing, with declination ±6 and 40 kt wind (the measurement used in the investigation, turned into an assertion).
  - Course `090 / +6 → 084`, `090 / −6 → 096`, `002 / +6 → 356`.
  - Effective TAS: a bound leg with stored 400 and regime 480 gives the 480 kt radius; a Manual leg and an orphan `regimeId` give 400.
  - Declination invariance: changing only the declination leaves geometry, distance, ETE, and fuel identical.
- **UI:** the declination readout shows `(+) 6.5°E`, `(−) 6.5°W`, and `0°`.
- **Parity:** the golden fixtures (D6) cover frontend ↔ backend agreement.

## Risks / Trade-offs

- **[Users see different numbers on existing plans]** → This is intended and called out as BREAKING in the proposal. The signed readout (`(+)`/`(−)`) makes a compensated declination visible so the user can re-enter it.
- **[Users who flipped the declination to compensate now get courses off by twice the declination]** → Not migrated (spec). The readout change is the mitigation. Mention it in the release notes.
- **[The refactor in D1 widens the diff of a bug fix]** → The extraction is mechanical and the golden tests pin the result. Order the work as: extract with identical output (goldens unchanged), then apply the fixes (goldens regenerated). Each step is then verifiable on its own.
- **[Map re-renders more often with the profile as a dependency]** → Profile edits are rare and the layer rebuild is already done on every plan change. Negligible.
- **[D5 changes headings beyond what the proposal names]** → It is a direct consequence of the spec's "at the effective TAS" wording, and it is limited to the displayed heading and the backend arc time.

## Migration Plan

- No data migration and no version bump. Deploy the frontend and backend together so the kneeboard and the app agree.
- **Rollback:** revert the change. No stored data is touched, so a rollback is lossless.
- Release notes cover:
  - courses and headings corrected for declination;
  - turns now join smoothly;
  - turns on regime-bound legs follow the regime TAS;
  - re-check your declination sign: `(+)` means East.
