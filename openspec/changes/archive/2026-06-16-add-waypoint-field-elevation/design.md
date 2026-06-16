## Context

The flight plan models each turnpoint with an `alt: number` field whose meaning is "cruise altitude of the segment going INTO this waypoint" (per the `performance-regime` convention). This convention is asymmetric at the endpoints:

- **WP0**: no incoming segment exists, so `WP0.alt` has no natural meaning. The UI never displays it. It defaults to `3000 ft` (`defaultAlt` constant in `flightPlanUtils.ts:15`) and silently controls the starting altitude of the leg-0 climb computation. This causes a class of bugs where setting the first segment's cruise altitude below 3000 ft produces a *descent* on leg 0 instead of the expected climb from field elevation.
- **WP_last**: `alt` legitimately means the cruise altitude of the final segment (the leg arriving at this waypoint).

The user's mental model — and the natural physical model — is that the **first and last waypoints are at airfield elevation**, and the takeoff/landing field elevation is independent from the cruise altitudes of the surrounding legs. The data model does not currently represent this.

Two related issues compound the same root cause:
1. `insertTurnPointAtMidpoint` copies the **origin** waypoint's altitude into the newly inserted point. Splitting an A→B leg produces A→newWP→B with newWP at A's altitude, which is wrong: the leg was being flown at B's altitude (climb completes early), so the physical midpoint is at B's altitude.
2. `addTurnPoint` silently rewrites the previous-to-last waypoint's `alt`/`tas`/`fuelFlow` with the values copied for the new waypoint (`flightPlanUtils.ts:36`). This back-fill masks the phantom WP0.alt problem because it keeps all waypoints in sync until the user touches one — but the data model is dishonest.

## Goals / Non-Goals

**Goals:**
- Make takeoff and landing field elevation first-class, user-editable concepts attached to the first and last waypoints.
- Anchor leg-0 climb math to the takeoff field elevation rather than to a phantom `WP0.alt`.
- Eliminate the spurious-descent bug on leg 0 when the user lowers the first segment's cruise altitude below the prior phantom default.
- Fix the midpoint-insert altitude-inheritance bug so splitting a leg is a lossless operation.
- Remove the `addTurnPoint` back-fill so that placing a new waypoint never mutates an already-placed waypoint's planning fields.
- Keep the model symmetric on both endpoints, even though only the takeoff side affects calculations in this change.

**Non-Goals:**
- Descent-at-end-of-leg behavior on the last leg (descending from cruise altitude down to landing field elevation before reaching the last waypoint). The data is captured (`WP_last.groundAlt`) but no calculation consumes it yet. This is deferred to a future change because it requires a new code path: today's `computeLegSegments` applies climb/descent at the *start* of a leg; the last leg would need it at the *end*.
- Landing performance segment (a `landing: LandingPerformance` block on the aircraft, symmetric to `takeoff`). Not in scope; can be added later alongside descent-at-end-of-leg.
- Automatic migration of existing flight plans. Behavior on legacy plans changes once the user sets `Field alt` in the UI.
- Multi-airfield flight plans (intermediate waypoints typed as airfield). The data model continues to assume only the first and last waypoints are airfields.
- Auto-populating field elevation from theatre/terrain data when a waypoint is placed near a known airfield. Could be a follow-up.
- Removing the now-dead `alt` field on `WP0`. Keeping every waypoint's shape uniform avoids forcing `alt?: number` (optional) across the codebase.

## Decisions

### Decision 1 — Storage shape: `groundAlt?: number` on `FlightPlanTurnPoint`

Add `groundAlt?: number` to `FlightPlanTurnPoint` (TypeScript) and to the dataclass mirror in `packages/backend/flight_plan.py`. The field is **optional in the data model** but **semantically meaningful only on the first and last waypoints**.

**Alternatives considered:**
- *Option X — repurpose `WP0.alt` as field elevation; add `groundAlt` only on `WP_last`*: rejected because it gives `alt` two different meanings depending on waypoint position, breaking the "into this waypoint" convention asymmetrically and making generic code (serialization, copy, etc.) harder to reason about.
- *Option Z — hoist `takeoffAlt` and `landingAlt` to `FlightPlan` top-level*: rejected because the UI lives on the waypoint card and the data would live elsewhere — an impedance mismatch. The endpoint-waypoint locality is also a natural place to store the field once descent-at-end-of-leg ships.

**Rationale for `groundAlt?: number`**:
- Symmetric: both endpoints have the same field.
- "alt" continues to mean exactly one thing everywhere ("cruise alt of segment arriving here").
- When the deferred descent-at-end work ships, `WP_last.groundAlt` is already in place — no second migration needed.
- Optional (`?`) handles legacy plans loaded without the field. Treated as `0` ft at the calc site.

### Decision 2 — Leg-0 climb start altitude

In `computeLegSegments`, when `legIndex === 0`, `prevAlt` SHALL be `origin.groundAlt ?? 0` (instead of `origin.alt`). For all other legs, `prevAlt = origin.alt` (unchanged). Mirror in `packages/backend/flight_plan.py:compute_leg_segments`.

`WP0.alt` is left in the type but no longer read by leg-0 math. It remains in serialised JSON to avoid churn on existing plans.

**Alternatives considered:**
- *Read `groundAlt` for every leg, falling back to `alt`*: rejected because intermediate waypoints have no field-elevation concept; conflating the two would invite future bugs.
- *Make `groundAlt` mandatory on WP0*: rejected because it forces a JSON migration for legacy plans and complicates the type. Optional with a `?? 0` fallback is simpler.

### Decision 3 — Midpoint insert inherits from destination

`insertTurnPointAtMidpoint` SHALL copy `alt`, `tas`, `fuelFlow`, and `regimeId` from the **destination** waypoint of the split leg, not the origin. The `name` continues to be generated as `WP{newIndex + 1}`. Lat/lon are computed as the midpoint (existing behavior). `windSpeed` and `windDir` are also copied from the destination (consistent with "into this waypoint" — the wind at the midpoint along the leg is naturally the destination's planning wind).

**Rationale:** The leg being split is being flown at destination's cruise altitude (climb/descent transitions complete early in the leg, per `computeLegSegments`). The physical midpoint of the leg is at destination altitude. Inheriting from destination makes the split a no-op for the calculation: A→B becomes A→newWP→B with newWP at B's planning state, and both halves continue to compute correctly without any spurious altitude changes.

**Alternatives considered:**
- *Average origin and destination altitudes*: rejected because the leg isn't physically flown at the average — climbs/descents are short and front-loaded.
- *Keep origin (status quo)*: this is the bug being fixed.

### Decision 4 — Remove the `addTurnPoint` back-fill

The block at `flightPlanUtils.ts:34-37` that rewrites `newPoints[newPoints.length - 2]`'s `tas`/`alt`/`fuelFlow`/`windSpeed`/`windDir` with the new waypoint's values SHALL be removed. Adding a waypoint no longer mutates any previously placed waypoint.

**Rationale:** The back-fill was hiding the phantom-WP0.alt problem by keeping all newly placed waypoints in sync. With `groundAlt` now explicit and the bug class understood, the back-fill is no longer needed and arguably harmful (it makes adding a waypoint a surprising side-effect operation).

**Trade-off:** Users who placed a chain of waypoints and relied on them auto-syncing must now set TAS/FF/alt explicitly per waypoint. This was rarely the user's *intent* — it was a defensive side effect — but the UI experience does change.

### Decision 5 — Defaults and initialization

- **New plans**: `flightPlanUtils.newFlightPlan` continues to start with `points: []`. No change.
- **First waypoint placed**: `addTurnPoint` continues to use `defaultAlt = 3000` for the `alt` field. It SHALL additionally set `groundAlt: 0` on the new waypoint. Subsequent waypoints SHALL NOT carry `groundAlt` (it's only meaningful on first/last). When a previously-last waypoint becomes interior (because a new waypoint is appended after it), its `groundAlt` SHALL be removed; when a new waypoint becomes the last, it SHALL receive `groundAlt: 0` if absent.
- **Legacy plans loaded from JSON without `groundAlt`**: leg-0 calc reads `origin.groundAlt ?? 0`, which yields 0 ft. The UI displays `0` in the Field alt input. User adjusts as needed.
- **`defaultAlt` constant**: left at 3000 ft (cruise altitude default — unrelated to field elevation).

**Alternatives considered:**
- *Always default `groundAlt` to undefined and rely on `?? 0` everywhere*: rejected because it makes the JSON sometimes carry the field and sometimes not, complicating round-trip tests and tooling. Explicit `0` on endpoints is clearer.
- *Set `groundAlt` on every waypoint, not just endpoints*: rejected because it's meaningless on interior waypoints and would pollute the JSON. Keep it where it's used.

### Decision 6 — UI placement

The "Field alt" input SHALL appear:
- On the **first** waypoint card (currently the WP that has no "segment" header above it).
- On the **last** waypoint card.

The input is a numeric field labelled `Field alt`, displayed in feet, integer values. Edit semantics are identical to existing altitude inputs (parse `parseInt`, dispatch `updateTurnPoint` with `{ groundAlt: ... }`).

The first and last waypoint cards have slightly different layouts already (no incoming segment for WP0, no outgoing segment for WP_last). The Field alt input slots in where the absent "segment altitude" field would otherwise be.

### Decision 7 — Serialization and round-trip

`groundAlt` SHALL be included in JSON when set. The frontend `FlightPlan` type version is unchanged (no schema bump). Backend dataclass loaders SHALL tolerate the field's absence (`groundAlt: Optional[float] = None`).

**Rationale:** This is an additive optional field. Existing plans round-trip unchanged. New plans gain the field. No version bump needed.

## Risks / Trade-offs

- **Phantom `WP0.alt` persists in data**: even after this change, `WP0.alt` continues to exist (defaults to `3000`) but is read by no code on leg 0. → Documented in this design; future refactor could either (a) make `alt` optional and drop it on WP0, or (b) add a typed waypoint variant. Both are deferred to avoid type-system churn.

- **Behaviour change on legacy plans**: plans that had the user's intended cruise altitude on the first segment set below 3000 ft will start drawing the leg-0 climb from 0 ft once loaded (because `groundAlt` is absent → treated as 0). → User adjusts in UI. Acceptable per the proposal.

- **`addTurnPoint` back-fill removal user-visible**: users who placed a route quickly and noticed the back-fill side effect will see different behaviour. → Most users edit each waypoint anyway; behaviour matches what they expect by inspection.

- **`WP_last.groundAlt` is stored but unused in calc**: a user setting "Field alt" on the last waypoint will see no effect on the rendered descent in this change. → Acceptable per the proposal; descent-at-end-of-leg is deferred. Consider a tooltip clarifying "currently informational; descent to field elevation is not yet rendered" — see open questions.

- **Adding/removing the last waypoint mutates `groundAlt`**: per Decision 5, appending a new waypoint demotes the previously-last waypoint and removes its `groundAlt`; the new last waypoint gets `groundAlt: 0`. If the user had set a landing field elevation, then added a new waypoint after it, the landing field elevation is lost (now attached to the new last waypoint as 0). → Trade-off accepted: the alternative (preserving `groundAlt` on demoted waypoints) leaks meaningless data into interior waypoints. Document in the spec scenarios.

- **Backend/frontend skew during deploy**: until both packages are updated, JSON written by the frontend may carry `groundAlt` that the backend ignores (and vice versa). → Acceptable: backend's `Optional[float]` handles absence, and unknown fields are typically tolerated. Ship frontend and backend together if possible.

## Migration Plan

No automatic migration. The behavior change ships as soon as the code lands:

1. **Frontend ships**: legacy plans load with `WP0.groundAlt = undefined → treated as 0`. Climb on leg 0 starts at 0 ft. Users open affected plans and set Field alt manually.
2. **Backend ships in lockstep**: same default-to-0 behavior in `compute_leg_segments`.
3. **Documentation**: changelog / release notes mention the field-elevation feature and the changed default for leg-0 climb start.

Rollback: revert the code change. Plans saved with `groundAlt` will continue to carry it (silently ignored by reverted code).

## Open Questions

All resolved during design review:

- **UI hint on `WP_last.groundAlt`**: not shipped. Revisit if users report confusion that the landing field elevation has no visible effect on the rendered descent.
- **Auto-fill field elevation from theatre data**: out of scope. Deferred as a possible follow-up enhancement.
- **Negative `groundAlt`**: allowed. No validation clamp. Revisit only if a real user case shows a problem.
