## Context

The flight plan data model lives in `packages/frontend/src/types/flightPlan.ts`. Each `FlightPlanTurnPoint` stores `alt`, `tas`, `fuelFlow`, `windSpeed`, `windDir`, `comment` — by convention, these describe the leg *ending at* that waypoint (the values used "into" the waypoint). `LegData` (course, distance, ETE, leg fuel, ETA, EFR) is derived from consecutive waypoints — never stored.

The right sidebar (`FlightPlanZone.tsx`) renders the route as a stack of `WaypointCard` and `RouteCard` components, with click-to-edit `EditableField`s for each numeric cell. Persistence is `localStorage` via `usePersistedFlightPlan` (debounced 300ms) plus JSON download/upload. The frontend version constant `FLIGHT_PLAN_VERSION` is currently `"1.1"`.

The backend (`packages/backend/`) is FastAPI + Pydantic. It receives the flight plan JSON and generates kneeboard PNGs. It currently re-computes `LegData` server-side for kneeboard rendering, mirroring the frontend logic. A `/calculate` API endpoint exists but is not the source of truth — both ends compute independently.

The Performance page is mounted at `/performance` (`PerformancePage.tsx`) and is currently a stub: a 400 px sidebar header reading "Performance" and a centred "coming soon" placeholder.

## Goals / Non-Goals

**Goals:**
- A clear data model where the regime reference is co-located with `tas`/`fuelFlow` on the waypoint, mirroring the existing "into this waypoint" convention.
- Climb/descent that is computed deterministically from regime data, with the same algorithm applied on both frontend (live UI) and backend (kneeboard rendering) so leg time and fuel always agree.
- Manual mode (no regime) preserved as a strict superset of today's behaviour.
- Long-climb / late-descent edge cases surfaced as warnings, never silently mis-computed.
- Migration of existing plans (v1.1) without user action.

**Non-Goals:**
- Aircraft-level regime libraries shared across plans (proposal-deferred).
- Bulk apply / multi-leg selection.
- Per-leg gross weight or configuration as a separate concept — folded into the regime name + comment by design.
- Variable altitude *within* a cruise segment — climb/descent always starts at the origin waypoint and completes within the leg, by convention.
- Reflecting regime concepts (regime names, regime identifiers) on the kneeboard — those are planning-only. The altitude climb/descent glyph (§9) is not a regime concept; it is derived purely from the altitude delta and appears unconditionally.

## Decisions

### 1. Data model: regime collection on plan, opaque reference on waypoint

Add a `Regime` type and a `regimes: Regime[]` field on `FlightPlan`. Add an optional `regimeId?: string` on `FlightPlanTurnPoint` (and `FlightPlanPointChange`).

```ts
interface Regime {
  id: string;            // opaque, generated on creation, immutable
  name: string;          // user-facing label, must be unique within plan
  comment?: string;      // free-form note (when to use it, loadout, etc.)
  cruise: { tas: number; ff: number };       // mandatory
  climb?:  { tas: number; ff: number; roc: number };  // optional; describes climbing UP TO this regime's cruise alt (fpm)
  descent?:{ tas: number; ff: number; rod: number };  // optional; describes descending DOWN TO this regime's cruise alt (fpm)
}
```

`id` is generated client-side on regime creation as a short random string (e.g. `crypto.randomUUID().slice(0, 8)`). Using an immutable id rather than the name means the user can rename a regime without breaking references. Names must be unique within a plan but only as a UX constraint (validated in the editor); the data model does not enforce it.

**Alternative considered:** use `name` as the foreign key. Rejected — renaming becomes either forbidden or requires cascade updates, both worse than a small id field.

### 2. `regimeId` is the source of truth; `tas`/`fuelFlow` mirror cruise values

When `regimeId` is set on a waypoint, the waypoint's `tas` and `fuelFlow` fields are kept *in sync* with the referenced regime's cruise values. Specifically:

- On regime selection in the leg picker: write the regime's `cruise.tas` and `cruise.ff` to the waypoint, set `regimeId`.
- On regime edit (Perf page) of the cruise values: walk every waypoint with that `regimeId` and update its `tas`/`fuelFlow`.
- On direct edit of `tas` or `fuelFlow` in the leg row: write the new value, clear `regimeId`.
- On regime deletion: clear `regimeId` from all referencing waypoints; `tas`/`fuelFlow` retain the last cruise values (they become Manual values, not zero).

This keeps `tas`/`fuelFlow` always-readable for any code that doesn't care about regimes (kneeboard info-box, exports, future features), while making `regimeId` authoritative for behaviour that does care (climb/descent computation, picker state).

`climb` and `descent` data on regimes are **never stored on the waypoint** — they're looked up at compute time. The leg row has no place to display them; they only affect derived `LegData`.

**Alternative considered:** store only `regimeId`, compute `tas`/`fuelFlow` on every read. Rejected — adds a regime lookup to every renderer and every backend serialiser, including paths that don't otherwise need the regime list. The mirror approach pays a small write-time cost (a list walk on regime edit) and saves a read-time cost everywhere else.

**Alternative considered:** stamp values once at selection time and never auto-update on regime edit. Rejected — defeats the point of regimes as a single source of truth. If a user retunes "Mid-loaded" they expect the change to propagate.

### 3. Climb/descent computation algorithm

For a leg from waypoint A (alt = `prevAlt`, wind = `windA`) to waypoint B (alt = `legAlt`, wind = `windB`, `regimeId` resolves to `regime`), with great-circle distance `D` and course `θ`:

```
altDelta = legAlt - prevAlt

if altDelta == 0 OR regime is null OR (altDelta > 0 AND regime.climb is null) OR (altDelta < 0 AND regime.descent is null):
    # level-leg path: today's behaviour
    use cruise TAS/FF for the entire leg
    return

phase = regime.climb if altDelta > 0 else regime.descent

# 1. Time to transition altitude
transitionTime = abs(altDelta) / phase.roc        # in minutes

# 2. Wind for the transition segment
#    Estimate the segment occupies the first f_estimate of the leg.
#    Use windA for the transition and windB for cruise (simple, robust).
#    See decision §4 for why we don't iteratively refine.
transitionGroundSpeed = applyWind(phase.tas, windA, θ)
transitionDistance    = transitionGroundSpeed * (transitionTime / 60)   # in nm

# 3. If the transition doesn't fit, raise the warning (decision §5)
if transitionDistance > D:
    return { warning: ..., fallback: leg fully in transition phase }

# 4. Cruise covers the remainder
cruiseDistance    = D - transitionDistance
cruiseGroundSpeed = applyWind(regime.cruise.tas, windB, θ)
cruiseTime        = (cruiseDistance / cruiseGroundSpeed) * 60           # in minutes

# 5. Sum
legTime = transitionTime + cruiseTime
legFuel = phase.ff * (transitionTime / 60) + regime.cruise.ff * (cruiseTime / 60)
```

Existing `applyWind(tas, wind, course)` logic (the function used today for level legs) is reused unchanged.

### 4. Wind interpolation: simple (origin for transition, destination for cruise)

The proposal mentioned "linear interpolation between the two winds, scaled by segment length." Two practical issues with strict linear interpolation:

- The interpolation midpoint depends on segment length, which depends on groundspeed, which depends on wind — circular. Resolvable by iteration but adds complexity.
- The improvement over a simple "windA for transition, windB for cruise" assignment is small relative to the regime fidelity (regimes themselves are ±5–10% estimates).

Decision: use `windA` for the climb/descent segment and `windB` for the cruise segment. This is the same approximation applied per-segment that today's calculation makes per-leg, so it's mentally consistent. If a future plan needs better fidelity, the interpolation can be revisited without changing the data model.

**Alternative considered:** linear interpolation at segment midpoint with one fixed-point iteration. Rejected for complexity; can be added later.

### 5. Long-transition warning: math and indicator

The warning fires when `transitionDistance > D` (climb won't fit) or, symmetrically for descents, when `transitionDistance > D` and `altDelta < 0` (descent equally won't fit). The leg row enters a warning state and displays a non-interactive `⚠ Fix` indicator.

The indicator is purely informational: it carries the same tooltip as the climb/descent glyph (`↗`/`↘`), which already shows "Transition too long — needs Xnm, only Ynm available". The user resolves the conflict themselves by editing the altitude, adjusting the route, or changing the regime — the standard editing tools already support all of these.

While in the warning state, the leg's calculated `legTime` / `legFuel` are computed as if the entire leg were in the transition phase (i.e., the aircraft never reaches cruise, but still doesn't reach `legAlt` either). The displayed altitude on the leg row remains `legAlt` (the user's *intent*), with the warning making clear that the math doesn't yet support that intent. This is the only place in the UI where the displayed altitude differs from physics; we accept it because the user is explicitly being told to fix it.

**Alternative considered:** silently distribute the unfinished climb across the next leg. Rejected — this introduces the declared-vs-actual altitude duality we explicitly rejected in the proposal phase.

### 6. RouteCard regime picker: compact dropdown, conditional visibility

The picker is a small dropdown (Radix `Select` or a lightweight equivalent matching existing styling) positioned at the top-right of the `RouteCard`, on the same row as the leg label. Empty state (no regime selected) shows `—`. Selected state shows the regime's name. Visibility:

```
if plan.regimes.length === 0:        hide picker entirely (today's UI)
else if regimeId is null:            show picker with "—" (Manual)
else:                                show picker with regime name
```

Clicking the picker opens a list of all regimes plus a final "— Manual —" entry; selecting Manual clears `regimeId` (and leaves the current `tas`/`fuelFlow` values in place, becoming the user's manual override). This makes the Manual transition reachable without forcing the user to re-edit a numeric field.

**Alternative considered:** the Manual state shown as the absence of a picker (no entry point in row). Rejected — the user can still want to *unbind* a leg from a regime and keep the values, and there's no other affordance for that.

### 7. Climb/descent icon and tooltip

Render a `↗` (climb), `↘` (descent), or nothing (level) glyph immediately to the left of the altitude cell, driven by `sign(altDelta)`. Hovering the glyph (or the row generally) shows a tooltip containing:

- Transition phase name ("Climb" / "Descent")
- Segment time, distance, fuel
- Cruise segment time, distance, fuel
- Total leg time and fuel (matches the row totals)

The tooltip is hidden when `altDelta == 0`. When the leg uses Manual mode (no regime), the tooltip shows only `altDelta` ("+15,000 ft over 80 nm") — there are no climb/cruise segments to break out.

### 8. Perf page layout: list–detail

The `/performance` route gets a list–detail layout consistent with the existing 400 px sidebar pattern:

- Left pane (sidebar): list of regimes for the active plan, with a "+ Add regime" button at the top. Each row shows the name and a small badge if climb/descent data is filled in.
- Right pane (main): edit form for the selected regime — name, comment, cruise (tas/ff), optional climb (tas/ff/roc), optional descent (tas/ff/rod). The climb and descent sections are labelled **"Climb up to this regime"** and **"Descent down to this regime"** respectively, making the directionality explicit: these values describe transitioning *to* the regime's cruise altitude when applied to a leg, not *from* it (a consequence of the start-of-leg convention; see decision §3). All numeric inputs follow the existing `EditableField` style. Delete button at the bottom of the form.

Validation:
- Name required, must be unique within the plan (live duplicate check, inline error).
- Cruise TAS and FF must be positive numbers.
- Climb / descent: either entirely filled or entirely blank — don't allow partial sets.

Deletion confirmation: if the regime is referenced by ≥ 1 waypoint, show "This regime is used on N legs. Deleting will revert them to Manual." with explicit confirm.

**Alternative considered:** edit inline in the list (no detail pane). Rejected — too cramped for 8 numeric fields plus comment plus name.

### 9. Frontend / backend computation parity

The same algorithm (decision §3) must run in two places: the frontend `LegData` derivation (live UI) and the backend kneeboard generator (`packages/backend/`). They will inevitably drift if both are hand-written and maintained separately.

Plan:
- Implement the algorithm in TypeScript first as the canonical reference, in a pure function with a fixed signature: `computeLegData(legInputs, regime?) → LegData`.
- Mirror the algorithm in Python in the backend.
- Add a contract test that loads a JSON fixture set of (input → expected output) pairs and runs both implementations against it. The fixture lives in a shared location (e.g. `packages/shared/test-fixtures/leg-calc/`) and is the single source of truth for behaviour. CI runs both the TS and Python tests against it.

Fixtures cover: level leg manual; level leg with regime; climbing leg with full regime; climbing leg with regime missing climb data (falls back to cruise); over-long climb (warning fires); descending leg; legacy plan without `regimes` field.

**Alternative considered:** call the existing FastAPI `/calculate` endpoint from the frontend instead of duplicating the algorithm. Rejected — debounced live recomputation against an HTTP endpoint is too slow for a typing-driven UI, and the offline mode (no backend) is a soft requirement of the planner.

### 9. Kneeboard altitude glyph

The doghouse (per-waypoint info box) displays the destination altitude. When the leg involves a climb or descent (destination altitude ≠ origin altitude), a `↑` or `↓` glyph is prepended to the altitude value in the doghouse. This applies to both the full doghouse (focus leg) and the mini-doghouse (adjacent legs).

The glyph is driven solely by `alt_delta = leg_alt - prev_alt`. It is not conditional on a regime being bound — a Manual leg changing altitude also shows the glyph. This keeps the kneeboard consistent with the sidebar's `↗`/`↘` indicator while using simpler vertical arrows suited to the compact doghouse format.

**Alternative considered:** use the same `↗`/`↘` arrows as the sidebar. Rejected — diagonal arrows are harder to read at the small doghouse font size; plain vertical arrows convey the direction clearly and compress better beside the altitude digits.

### 10. Migration from v1.1 → v1.2

`usePersistedFlightPlan` reads the version from JSON. If `version === "1.1"`:
- Synthesise `regimes: []` if missing.
- Leave waypoint `regimeId` undefined.
- Bump in-memory version to `"1.2"` so the next save writes the new format.

No data is lost; all existing waypoints become Manual mode (which is exactly today's behaviour with the picker hidden). Backend Pydantic models accept either version transparently — extra fields default to empty.

## Risks / Trade-offs

- **Algorithm drift between TS and Python.** Mitigated by the shared fixture contract test (decision §9). Watch for floating-point edge cases that pass on one runtime but fail on the other.
- **Regime edits propagate silently to many legs.** A user might change `Mid-loaded` cruise FF and not realise five legs in their plan just had their leg fuel updated. Mitigation: keep regimes a small per-plan list rather than a global library — the user is editing within the context of one plan they're actively working on.
- **The `tas`/`fuelFlow` mirror approach has a subtle invariant.** When `regimeId` is set, `tas`/`fuelFlow` *should* equal the regime's cruise values. If they ever desync (e.g., a buggy migration writes inconsistent data), the leg row displays the stored values but climb/descent computation reads the regime — a confusing split. A startup-time validation pass (or a lazy fix-on-load) can detect and repair.
- **Wind approximation imperfection.** Decision §4 uses windA for transition, windB for cruise. For legs with strong wind shear between waypoints, this can be a few percent off. Acceptable given regime fidelity; revisit if user feedback indicates otherwise.
- **The "fallback to entire-leg-in-transition" for over-long climbs is a bit unphysical.** It computes leg time/fuel as if the aircraft climbed the whole way, but the displayed altitude is still the user's target. The warning makes the inconsistency explicit and actionable. Alternative would be to display `—` for time/fuel until resolved, but that's worse UX (silent data hole).
- **Legacy plan compat depends on Pydantic accepting absent fields.** If existing models use strict validation, they'll need `Optional` annotations on `regimes` and `regimeId`.
