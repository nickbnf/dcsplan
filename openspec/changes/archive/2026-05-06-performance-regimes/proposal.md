## Why

Pilots currently enter TAS and fuel flow by hand on every leg. For aircraft flown across many missions, this is repetitive: the same handful of operating points (e.g. "low-loaded ingress", "high-clean egress") are typed in over and over, and the values must be recalled or looked up from documentation every time. By letting the user define a small set of named performance regimes once and apply them per leg, the per-mission planning effort drops sharply and leg fuel/time figures stay consistent across plans. The feature also lets the app account for the higher fuel burn and reduced groundspeed during climbs and the reverse in descents, which today are silently treated as level flight.

## What Changes

- Populate the existing Perf page (currently a stub at `/performance`) with regime CRUD: list of regimes on the left, edit form on the right.
- Add a `regimes` collection to the flight plan: a flat list of user-defined regimes. Each regime has a name, mandatory cruise TAS/FF, and optional climb (TAS, FF, rate of climb) and descent (TAS, FF, rate of descent). Climb data describes climbing *up to* the cruise altitude of a leg using this regime; descent data describes descending *down to* it. (This is a consequence of the start-of-leg convention — the transition is always *toward* the leg's altitude, never away from it.) Also, a free-form comment for the user to describe when to use the regime (applicable altitude, loadout...).
- Add an optional `regimeId` reference on each waypoint, stored alongside the existing `tas`/`fuelFlow`/`alt` (same convention).
- In the leg row of the Plan page, when at least one regime is defined, show a regime picker (defaults to empty, meaning "Manual" selection of TAS/FF). Selecting a regime stamps that regime's cruise TAS/FF onto the waypoint; the leg row displays the cruise numbers as the regime's outputs. When no regimes are defined in the plan, the leg row UI is unchanged from today.
- Editing TAS or FF directly reverts the waypoint to Manual (regime reference cleared). Editing altitude or wind does not break the regime link — alt is an input to the climb/descent computation, not an output, and wind is unrelated to regime.
- When a leg's altitude delta is non-zero and the selected regime has climb (or descent) data filled in, leg time and fuel are computed as climb-segment + cruise-segment rather than treating the whole leg as level. If the regime's climb/descent fields are empty, cruise values are used for the whole leg (today's behaviour).
- Show a `↗` or `↘` icon next to the altitude on the leg row when the leg climbs or descends. A tooltip on the icon shows the climb/cruise/descent breakdown (segment distance, time, fuel). Altitude is conceptually a property of the leg — its cruise altitude. By convention, climb or descent occurs at the start of the leg: the origin waypoint is crossed at the previous leg's altitude, then the aircraft transitions to this leg's altitude and cruises to the destination.
- When a leg's climb cannot be completed within its distance (top-of-climb falls beyond the destination waypoint), the leg shows a warning with three actionable suggestions: lower the destination altitude to what is reachable, insert an intermediate waypoint at the projected top-of-climb point, or pick a regime with a higher rate of climb. Same shape applies to descents that start too late. The user resolves manually; the app does not silently extend the climb across legs.
- Bump `FLIGHT_PLAN_VERSION` from `1.1` to `1.2`. Plans saved before this change load cleanly: missing `regimes` becomes `[]`, missing `regimeId` on a waypoint means Manual.

Out of scope for this change (deferred):

- Import/export of regimes between plans (regime libraries per aircraft).
- Aircraft-level regime collections that span multiple flight plans.
- Bulk operations such as applying a regime to a multi-leg selection.
- Automatic gross-weight tracking that would feed into a per-leg "configuration" — the simplification adopted here folds configuration into the regime name.

## Capabilities

### New Capabilities

- `performance-regime`: Ability to define a list of named performance regimes (cruise plus optional climb/descent) on a flight plan, assign them to waypoints, and have leg time and fuel computed from the selected regime including climb/descent segments.

### Modified Capabilities

## Impact

- `packages/frontend/src/types/flightPlan.ts` — add the `Regime` type and a `regimes: Regime[]` field on `FlightPlan`; add `regimeId?: string` to `FlightPlanTurnPoint` and `FlightPlanPointChange`; bump `FLIGHT_PLAN_VERSION` to `1.2`.
- `packages/frontend/src/components/PerformancePage.tsx` — replace the placeholder content with a regime list and edit form (CRUD over the plan's `regimes` collection).
- `packages/frontend/src/components/sidebar/FlightPlanZone.tsx` — extend `RouteCard` to show the regime picker (when regimes exist), the climb/descent icon on altitude, the tooltip breakdown, and the long-climb warning with its three suggestion actions.
- Leg-calculation code (currently derives `LegData` from consecutive waypoints) — extend to split a leg into climb + cruise (or cruise + descent) segments when the selected regime has climb/descent data and altitude delta is non-zero. Compute leg time and fuel as the sum of segment contributions.
- `packages/frontend/src/hooks/usePersistedFlightPlan.ts` — handle the version bump on load (default `regimes` to `[]`, leave waypoint `regimeId` undefined).
- `packages/backend/` — Pydantic models for the flight plan must accept the new `regimes` field and the optional `regimeId` on waypoints. Kneeboard generation must apply the same climb-segment + cruise-segment computation as the frontend so that leg time and fuel printed on the kneeboard reflect regime-driven values; the regime concept itself is planning-only and no regime names or markers SHALL appear on the kneeboard.
