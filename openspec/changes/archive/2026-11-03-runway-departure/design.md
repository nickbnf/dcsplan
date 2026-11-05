# Design

## Context

See `proposal.md` for the motivation and `specs/departure/spec.md` for the required behaviour. This design builds on the archived `fix-turn-inbound-bearing` change and the `leg-geometry` spec:
- **Declination:** East-positive, magnetic = true − declination.
- **Wind:** `windDir` is true and is always combined with the true track.
- **Effective TAS:** the regime cruise TAS on bound legs, otherwise the stored `tas`.
- **Turn hand-off:** each leg's turn starts along the previous leg's `outboundBearing`.

The relevant shape of the code today:

```
 FRONTEND (utils/legCalculations.ts)                    BACKEND (flight_plan.py)
 ─────────────────────────────────────────────────      ───────────────────────────────────────
 computeLegGeometries(plan, proj, mode, aircraft)       FlightPlanData loop
   leg 1: straightening = WP0, no turn                    LegData(i, inbound_bearing)
   legs 2..N: calculateStraighteningPoint (circle)          leg 1: TurnData(0,0), S = WP0
   → course, heading, distanceNm, outboundBearing           compute_leg_segments(course=bearing)
 calculateAllLegData                                      map_annotations.draw_leg
   computeLegSegments({distance, course, windA/B,           Pillow draw.arc around turn centre
                       legIndex, takeoff}, regime)        overview_map_page / kneeboard bbox
   level ETE = distance / applyWind(tas, windB, course)     waypoints + straightening pts + centres
 flightPlanLayer: arc (generateArcPoints) + line
 FlightPlanZone: "⚠ Fix" when segmentsResult is a warning
```

**Constraints that shape the approach:**
- **Circle-only turn model.** Turns are described everywhere by a turn centre, a radius, and a straightening point. The frontend draws them with `generateArcPoints`, the backend with Pillow's `draw.arc`. A widening spiral fits neither.
- **One fixed course per leg.** `computeLegSegments` / `compute_leg_segments` apply wind with a single `course` for every segment of the leg.
- **Profile fields are plain and LWW (AD-2, AD-6).** In the anonymous tier they live in `performanceStorage`. Import validation goes through `parseAircraftBlock`.
- **Waypoint fields sync by an allow-list.** They travel through the Y.Doc via the field list in `yjsFlightPlanBinding.ts` (`groundAlt` is there today).

## Goals / Non-Goals

**Goals:**
- One departure computation per side, producing both the drawn path and the per-segment ground distances and times. The map, the sidebar, and the kneeboard then agree.
- Plans without a runway take exactly today's code path. Golden fixtures (which have no runway) stay byte-identical.
- The constant-speed case reduces to the existing circular-arc construction, as a built-in correctness check.

**Non-Goals:**
- Replacing the circle model for legs 2..N.
- A general "variable-speed turn" for every leg. Only leg 1 gets a sampled path.
- Making the drawn path depend on wind (spec: the drawn path is wind-independent).

## Decisions

### D1. The speed schedule is a function of time from brake release, known before the geometry

Every departure speed rule is time-based:
- the take-off phase lasts `T`;
- the climb or descent lasts `|Δalt| / roc` minutes (the same formula `computeLegSegments` uses);
- cruise follows.

So the TAS at time `t`, `v(t)`, can be built before the path, from the plan and the profile alone: `departureSchedule(plan, aircraft) → { phases: [{ kind, t0, t1, v(t) }], Vc }`. Its parts:
- **Take-off phase:** present only when the take-off segment is active. It uses `v(t) = Vc·(t/T)^p` with `p = Vc·T/D − 1`. When `D ≥ Vc·T`, it uses the constant `D/T` instead.
- **Transition phase:** present only when the regime has matching transition data and `Δalt ≠ 0`. It runs at the transition TAS.
- **Cruise phase:** open-ended, at the effective TAS.
- **`Vc`:** the TAS of the phase that follows take-off.

**Shared predicates.** "Is the take-off segment active?" and "Is there a transition phase, and of what kind?" are extracted into two small predicate functions. `computeLegSegments` and `departureSchedule` both call them, so the geometry and the timing cannot disagree about which phases exist.

*Alternative considered:* a distance-based schedule, where speed depends on the distance flown. With wind, that would make the path's shape depend on ground speed, which contradicts the wind-independent drawing and couples geometry to timing. Rejected.

### D2. The departure path is integrated in still air with exact constant-speed arc steps

`buildDeparturePath(wp0, wp1, runwayTrue, S, schedule, bank, mode, projection)` steps forward in time from brake release, with step `dt = 1 s` and step boundaries also placed exactly at the phase boundaries and at the start of the turn:
1. **Straight phase.** Advance along the runway true heading until the air distance reaches `S`.
2. **Turn phase.** The direction is the side of the runway heading on which WP1 lies, as seen from the start of the turn. Each step takes the TAS at the step's midpoint, `v_m`. It advances along an exact circular arc with radius `v_m² / (g·tan bank)` and heading change `g·tan(bank)/v_m · dt`. A constant-speed turn is therefore integrated exactly, which satisfies the spec scenario "Constant-speed turn equals a circular arc".
3. **Roll-out.** After each step, check the sign of the cross product between the track and the bearing to WP1. When it flips, solve within that step (bisection on the step fraction) for the point where the track points exactly at WP1. That point is the roll-out point.
4. **Unreachable.** The path is unreachable when WP1 is closer to WP0 than `S`, or when the accumulated turn exceeds 2π before roll-out.

**Positions.** In both navigation modes, points advance in the navigation projection's metres, and the track and the bearing to WP1 are grid angles in that projection. This is exactly how `calculateStraighteningPoint` builds every other turn, in geographic mode too, so a constant-speed departure reproduces the existing arc construction. (An earlier draft stepped on the sphere in geographic mode. It was dropped during implementation because it would not match the other turns.)

**Output.** A `DeparturePath`:
- `points: [lat, lon][]`, from WP0 to the roll-out point;
- `samples: { t, s, track }[]`: time from brake release, air distance, and true track at each step boundary;
- `rollOut: { t, s, lat, lon }`;
- `turnAngleRad`;
- `unreachable: boolean`.

`calculateStraighteningPoint` is untouched.

*Alternative considered:* a closed form, treating the turn as a circle at `Vc` plus a straight acceleration segment. It is cheaper, but it is wrong exactly when the departure matters, with take-off acceleration still running in the turn. It also doesn't handle a top of climb inside the turn. Rejected. A sampled path at 1 s costs a few hundred steps per recompute, which is negligible next to the existing per-edit work.

### D3. `computeLegGeometries` gains a leg-1 departure branch; the rest of the loop is unchanged

When `i === 0`, there are at least two points, and `points[0].runway` is set:
- `runwayTrue = (runway·10 + declination + 360) % 360`. This is the exact inverse of `course = true − declination`, so a runway-aligned departure displays course `runway·10`.
- `S = straightOutDistanceNm(aircraft)`, which returns 2 NM when the profile has no value (null profile included).
- **Reachable path:**
  - The leg's `straightening` is the roll-out point.
  - `outboundBearing` is the bearing from the roll-out point to WP1, so `course`, `heading`, and the next leg's `inboundBearing` follow the existing code unchanged ("Following legs are unchanged").
  - `distanceNm = (rollOut.s + straight)/1852`.
  - `turnAngleRad` is the accumulated turn.
  - `turnCenter` stays (0, 0), the existing "no circle" sentinel.
  - The `DeparturePath` is attached as `LegGeometry.departure`.
- **Unreachable path:**
  - Leg 1 is computed exactly as without a runway.
  - `LegGeometry.departureWarning = 'unreachable'` is set.

`LegDrawDataResult` keeps `departure.points` so the map can draw it.

### D4. Wind along the track: `computeLegSegments` takes an optional track model instead of the fixed course

`computeLegSegments` keeps its signature and gains an optional `departure?: DepartureTiming`. When it is absent, every line runs as today, so plans without a runway give bit-identical results. When it is present, the three wind applications are replaced:

| Segment | Today | With `departure` |
|---|---|---|
| Take-off ground distance | `applyWind(D/T, windA, course) · T` | `groundDistance(0, T, windA)` = ∫ (v(t) + w∥(track(t))) dt over the sampled schedule |
| Transition ground distance | `applyWind(Vtr, windA, course) · Ttr` | `groundDistance(T, T+Ttr, windA)` |
| Cruise time | `remaining / applyWind(Vcr, windB, course)` | `timeOver(s0, L, Vcr, windB)` = ∫ ds / (Vcr + w∥(track(s))) |

**Level leg.** The no-segment ETE in `calculateAllLegData` (`distance / applyWind(...)`) uses `timeOver(0, L, tas, windB)` when the leg has a departure.

**Time and fuel.** Take-off time and fuel stay verbatim. Transition time stays `|Δalt|/roc`. Fuel per segment stays `ff × time`, which also gives the spec's "take-off fuel accrues in proportion to time".

**Where each track comes from.**
- **Time-defined phases** (take-off, transition) read the track from the still-air schedule (`track(t)`).
- **The distance-defined phase** (cruise) reads the track by path position (`track(s)`). Past the roll-out, `track(s)` is the constant `outboundBearing`.
- `s0` is the sum of the take-off and transition ground distances, the same bookkeeping as today.

**Warnings.** The existing `transition-too-long` warning keeps its rule: take-off plus transition ground distance greater than the leg distance.

`DepartureTiming` is built from the `DeparturePath` samples (piecewise-linear `track` between samples, trapezoidal integration). It lives next to the path builder.

*Alternative considered:* split leg 1 into pseudo-legs (runway, turn, straight), each with its own course. Phases don't line up with geometric pieces (take-off can end mid-turn, top of climb can fall anywhere), so every phase would need splitting across pieces anyway. Rejected.

### D5. One module per side, mirrored function by function

- **Frontend:** a new `utils/departure.ts` holds:
  - `departureSchedule`;
  - `buildDeparturePath`;
  - `departureTiming`;
  - the take-off / transition predicates;
  - `straightOutDistanceNm`.
  
  `legCalculations.ts` imports from it.
- **Backend:** a new `departure.py` holds the same functions with the same names in snake_case. `LegData` uses it on leg 1. It stores `departure_path` (or `None`) and `departure_warning`, and passes a timing object to `compute_leg_segments`.

Keeping the two files structurally parallel is how parity has been maintained for `legCalculations.ts` ↔ `flight_plan.py`. Shared golden fixtures enforce it (D9).

### D6. Rendering: the departure is a polyline on both sides

- **Frontend (`flightPlanLayer.ts`).** When `leg.departure` is present, the leg's `LineString` is `departure.points` followed by the destination, instead of the arc-plus-line. The course label stays on the final straight segment, which is the existing straightening → destination segment.
- **Backend (`map_annotations.draw_leg`).** When `leg_data.departure_path` is present, the path is drawn with `draw.line` through the projected points, with the same halo and width as arcs, instead of `draw.arc`.
- **Map bounds.** `overview_map_page` and the kneeboard leg-map bounding box add every departure-path point to their bounds, alongside the existing straightening points and turn centres.
- **Kneeboard leg map rotation.** It keeps using straightening → destination, so the leg-1 map is oriented along the final course, as for other legs.

### D7. Warnings: a separate `departureWarning` on the leg, shown through the existing `⚠ Fix` badge

`LegData` gains `departureWarning?: 'unreachable'`, passed through from the geometry. `FlightPlanZone` shows the badge when either the segments result is a `warning` or `departureWarning` is set. The tooltip lists each applicable message. The unreachable message is "WP1 cannot be reached from the runway departure (closer than the straight-out distance or inside the turn)".

*Alternative considered:* a new `LegSegmentsWarning.reason`. The unreachable case falls back to a normal leg-1 computation, which can itself produce a `transition-too-long` warning, so the two must coexist. Rejected.

### D8. Data model and input

- **Waypoint field.**
  - `FlightPlanTurnPoint.runway?: number` and `FlightPlanPointChange.runway?: number`.
  - Added to the Yjs waypoint field allow-list, so it syncs, is versioned, and round-trips like `groundAlt` (AD-6).
  - The backend gets `runway: Optional[int] = Field(None, ge=1, le=36)`.
  - Only `points[0].runway` is ever read. No code copies it on insert or delete.
- **Profile field.**
  - `Aircraft.straightOutDistance?: number` (NM). It is optional rather than defaulted in storage, so stored and imported profiles from before this change need no migration.
  - `straightOutDistanceNm(aircraft)` resolves the 2 NM default everywhere it is read: geometry, the Perf page display, and the backend `Aircraft.straightOutDistance: float = Field(2.0, gt=0)`.
- **Validation and storage.**
  - `parseAircraftBlock` accepts it when absent and rejects it when ≤ 0.
  - Export writes it only when set.
  - `isDefaultAircraft` treats absent and `2` as equal.
- **UI.**
  - A "Rwy" input on the first waypoint card beside "Field alt". It reuses that input's commit and validation pattern, displays the runway as two digits, and clears on an empty commit.
  - A "Straight out" input with an info tooltip on the Perf page's General performance line.

### D9. Tests

**Unit, frontend (`departure.test.ts`):**
- the `p` fit (`D = Vc·T/2 → p = 1`);
- the fallback for `D ≥ Vc·T`;
- air distance over the take-off phase = `D` (within 1 m);
- half the take-off time → half the take-off fuel;
- constant-speed departure: the turn end matches `calculateStraighteningPoint` at `Vc` with the same inbound bearing and origin at the turn start (within 1 m);
- auto direction left and right;
- WP1 on the axis → no turn, distance = WP0→WP1;
- the unreachable cases (closer than `S`, inside the turn);
- a top of climb inside the turn → the radius after it equals the cruise-TAS radius.

**Integration, frontend (`legCalculations.test.ts`):**
- no runway → results deep-equal to the pre-change output;
- runway-aligned course displays `runway·10` with declination ±6;
- a runway headwind reduces the take-off ground distance even though it is a tailwind on the WP0→WP1 course;
- wind changes leave `departure.points` unchanged.

**Backend:** the same cases in `test_departure.py`.

**Parity:**
- Add one fixture plan with a runway, a take-off block, and a climb to `packages/shared/theatre-golden/plans.json`. Fixtures gain an optional `key` (default: the theatre) and an optional `aircraft`, so a second plan on the same theatre can fly its own profile.
- Regenerate only that plan's expected entries. The existing entries must not change.
- Check by hand that the frontend and backend leg-1 distance, ETE, and fuel agree within the existing tolerances.

**UI:**
- the Rwy input appears only on the first card, with the commit, clear, and reject cases;
- the Perf page straight-out field shows the default, and its tooltip text matches the spec;
- the `⚠ Fix` badge shows the unreachable tooltip.

## Risks / Trade-offs

- **[Time-defined phases read the track from the still-air schedule]** With wind, the aircraft is not at the still-air position at time `t`, so the track it flies at `t` differs slightly. → This is the same approximation the app already makes by drawing every path in the air frame. The error is second order: track × wind over a turn lasting a minute or two. It is documented in code next to `groundDistance`.
- **[Frontend and backend numeric drift in a sampled integration]** → Both sides use the same step rule (1 s steps, plus exact steps at phase and turn boundaries) and the same roll-out bisection tolerance. The runway golden fixture pins agreement.
- **[1 s steps miss very short phases]** → Phase boundaries are inserted as exact step boundaries, so a 0.4 s phase is still one step. The roll-out is found by bisection, not by the step grid.
- **[Steep fits `p ≫ 1` (tiny `D` relative to `Vc·T`)]** → The speed stays near 0 for most of the take-off, giving a tiny radius if the turn happens then. `S` is normally larger than `D`, so turns rarely start during take-off. When one does, the integration still holds, because the radius goes to 0 only as `v` does.
- **[A runway set on a plan whose WP1 is very close]** → Covered by the unreachable fallback and the `⚠ Fix` badge, with no silent wrong path.
- **[Performance: one sampled path per recompute]** → A few hundred steps, on leg 1 only. The map and the sidebar each call `computeLegGeometries` once per change, as today.

## Migration Plan

- No data migration, and no `FLIGHT_PLAN_VERSION` bump. Both new fields are optional, and existing plans (no runway) compute exactly as before.
- Deploy the frontend and backend together, so kneeboard timings match the app for plans with a runway.
- **Rollback:** revert. A stored `runway` or `straightOutDistance` is ignored by older code: the Yjs fields and the Pydantic model tolerate extra keys.
