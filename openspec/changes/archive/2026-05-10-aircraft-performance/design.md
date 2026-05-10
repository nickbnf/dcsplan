## Context

The performance regime feature (archived `2026-05-06-performance-regimes`) introduced a `regimes: Regime[]` collection on `FlightPlan` and a 2-phase leg computation (climb-or-descent + cruise). It deliberately deferred (a) any aircraft-level fields, (b) any take-off / acceleration modelling, and (c) any portability of regimes between plans.

This change closes those three gaps in a single coherent step. The user already maintains a small set of regimes per airframe and wants to author them once, save the result as a JSON file, and load it onto any new flight plan. The same JSON is the natural place to also park aircraft-level data that is independent of any one regime: the aircraft's display name, the take-off configuration text, the taxi fuel constant, and the chart-derived take-off / acceleration block (time, fuel, distance).

The leg-1 computation gap is small in code surface but high impact in numbers: a T/O run plus initial acceleration can cost tens of seconds and a few hundred pounds of fuel that today are silently absorbed into "cruise". The fix is to insert a third segment ahead of the existing climb segment on leg 1.

Constraints inherited from the project:

- No backend storage. Persistence is localStorage in the browser, plus user-driven file download/upload.
- Frontend is the canonical computation surface; the backend re-implements the same math for kneeboard generation. Parity is mandatory and is enforced by `test_leg_calc_contract.py`.
- Plans must round-trip through JSON — schema-versioned, with a migration path from older versions on load.

## Goals / Non-Goals

**Goals**

- Capture aircraft-level performance data (`model`, `takeoffConfiguration`, `taxiFuel`, `takeoff` block) on the flight plan with a clear UX entry point on the Perf page.
- Provide a portable performance JSON file format, decoupled from the flight-plan file format, with download and upload from the Perf page.
- Replace (no merge) the aircraft and regime sections on import, with an explicit confirmation dialog that mirrors the existing flight-plan import flow.
- Insert a wind-corrected take-off segment at the start of leg 1 when (and only when) leg 1 is bound to a regime and the T/O block has positive `timeSec` and `distance` values.
- Deduct `taxiFuel` from the EFR chain at the start of leg 1 (after `initFob`, before the T/O segment burns fuel).
- Print `model` and `takeoffConfiguration` on the kneeboard waypoint page as a passive header.
- Migrate v1.2 plans cleanly to v1.3 with safe defaults that preserve current behaviour.

**Non-Goals**

- Merging imported aircraft/regimes into the existing plan (full-replace only).
- Multi-aircraft per plan, mid-mission aircraft swap, or per-leg taxi/refuel events.
- Conditional T/O performance (temperature, runway altitude, gross weight). The user enters one set of constants per plan; varying them per condition is out of scope.
- Showing the T/O segment as a row on the kneeboard's per-leg breakdown. The kneeboard uses computed totals only; the segment breakdown is a frontend tooltip concern.

## Decisions

### D1 — Regimes live inside the aircraft

The aircraft is the unit of portable performance data. Two airframes have different regimes; the regime set is one of the aircraft's defining traits, alongside its model name, T/O configuration, taxi fuel, and T/O block. The data model reflects that:

```ts
type Aircraft = {
  model: string;                    // free text, default ""
  takeoffConfiguration: string;     // free text, default ""
  taxiFuel: number;                 // lbs, default 0
  takeoff: { timeSec: number; fuel: number; distance: number }; // 0/0/0 default
  regimes: Regime[];                // moved here from FlightPlan
};

type FlightPlan = {
  // ...existing fields...
  aircraft: Aircraft;
  // (regimes removed from the top level)
};
```

**Why nest regimes under `aircraft`:**
- Semantic accuracy. A regime is "this aircraft cruising at this setting", not "this flight plan's collection of cruise modes". Different airframes own different regime sets.
- The performance package becomes one self-contained object — `aircraft` — instead of two keys that have to travel together.
- Future "aircraft library" feature (deferred) becomes obvious: a saved aircraft is a single object, not a tuple.

**Migration cost:** modest but contained. The on-disk migration is one extra line in the load path (`aircraft.regimes = legacyPlan.regimes ?? []`). The code-level cost is renaming ~15–20 read sites across frontend and backend (`flightPlan.regimes` → `flightPlan.aircraft.regimes`); these are mechanical and covered by one commit. The existing tests pin the behavioural surface, so regressions are caught immediately.

**Alternatives considered:**
- Flat fields on `FlightPlan` (`aircraftModel`, `taxiFuel`, `takeoffTime`, …) — rejected; visually clutters `FlightPlan` and obscures grouping.
- Keep `regimes` at the top level alongside `aircraft` — rejected per the rationale above; the performance package would have to bundle two unrelated keys.
- A single `performance` wrapper holding both `aircraft` (without regimes) and `regimes` — rejected; same drawback as the previous option, plus an extra layer of nesting that buys nothing.

### D2 — Performance package file format

A new top-level envelope, **independent** of the flight-plan envelope:

```json
{
  "version": "1.0",
  "aircraft": {
    "model": "F-15E",
    "takeoffConfiguration": "MIL @ 60klb",
    "taxiFuel": 400,
    "takeoff": { "timeSec": 75, "fuel": 250, "distance": 1.8 },
    "regimes": [
      {
        "id": "abc12345",
        "name": "Cruise",
        "comment": "Standard cruise at 30k",
        "cruise": { "tas": 420, "ff": 3600 },
        "climb":  { "tas": 280, "ff": 12000, "roc": 4000 },
        "descent":{ "tas": 350, "ff": 2200,  "rod": 2000 }
      }
    ]
  }
}
```

`PERFORMANCE_FILE_VERSION = "1.0"` is its own constant, separate from `FLIGHT_PLAN_VERSION`. The two formats evolve independently: a flight plan can advance to v1.4 without forcing the performance file to bump.

The envelope is `{ version, aircraft }` rather than `{ version, performance: { aircraft } }` — since regimes live inside `aircraft` (D1), the aircraft is the entire performance package. No extra wrapper is needed.

**Why a separate envelope rather than reusing the flight-plan envelope:**
- Reusing the flight-plan envelope with stripped waypoints would require a marker ("this is performance-only"), and parsing rules would have to branch on the marker. A distinct top-level shape (`aircraft` vs. `flightPlan`) is unambiguous.
- The performance file is conceptually a different artifact (per-airframe configuration) and benefits from its own version line so users can mix-and-match files of different vintages.

**Alternatives considered:**
- Re-use `VersionedFlightPlan` with optional `points` — rejected; ambiguous on import.
- A bare object (no envelope) — rejected; future format evolution needs a version field.

### D3 — Import / export workflow

This section spells out the user-visible flow and the validation contract end-to-end so implementation has no ambiguity.

#### Export

Trigger: a single button on the Perf page header, labelled `⬇ Export performance`. The button is always enabled — even an empty aircraft (zero T/O block, no regimes) is valid to export.

On click:
1. Build the envelope: `{ version: PERFORMANCE_FILE_VERSION, aircraft: { ...flightPlan.aircraft } }` — a deep copy, so the export object cannot mutate the in-memory plan.
2. Serialise with `JSON.stringify(envelope, null, 2)` (matches the flight-plan download for diff-friendliness).
3. Filename: `<slug>.perf.json` where `<slug>` is the slugified `aircraft.model`. If the model is empty, fall back to `performance.json`. (Re-uses the existing `slugifyPlanName` helper.)
4. Trigger the browser download via the existing blob/URL/anchor pattern in `flightPlanUtils.downloadFlightPlan`.

#### Import

Trigger: a button on the Perf page header, labelled `⬆ Import performance`. Clicking opens a hidden file input filtered to `.json`.

```
   Click "Import performance"        ┌────────────────────────────────┐
        │                            │ Confirmation dialog            │
        ▼                            │  ┌──────────────────────────┐  │
   File picker  ──── select ────▶    │  │ Replace performance?     │  │
        │                            │  │                          │  │
        │ parse + validate           │  │ File: f-15e.perf.json    │  │
        │ (frontend Zod-style)       │  │ Aircraft: F-15E          │  │
        │                            │  │ T/O Config: MIL @ 60klb  │  │
        │ if invalid: inline error   │  │ Regimes: 4               │  │
        │ in dialog, no apply        │  │                          │  │
        │                            │  │  N legs will revert      │  │
        ▼                            │  │  to Manual.              │  │
   show preview ─── confirm ───▶     │  │                          │  │
        │                            │  │ [Cancel]    [Replace]    │  │
        │  apply replace             │  └──────────────────────────┘  │
        ▼                            └────────────────────────────────┘
   plan.aircraft = imported.aircraft
   walk waypoints, clear orphan regimeIds
```

**Validation pipeline (frontend, on file selection, before showing the dialog):**

1. Read the file as text. Parse as JSON. On parse error → dialog opens with an inline error and the `Replace` button disabled.
2. Check `version === "1.0"`. Reject any other version with a clear "unsupported file version" error. (Future readers may upgrade older files in this step.)
3. Check `aircraft` is an object. Required fields:
   - `model`: string (may be empty)
   - `takeoffConfiguration`: string (may be empty)
   - `taxiFuel`: number, ≥ 0
   - `takeoff.timeSec`, `takeoff.fuel`, `takeoff.distance`: numbers, all ≥ 0; either all zero or all positive (D7 validation, applied here too)
   - `regimes`: array (may be empty)
4. Each regime must satisfy the existing `performance-regime` validation rules: `id` non-empty, `name` non-empty, `cruise.tas > 0`, `cruise.ff > 0`, climb (if present) fully filled with positive values, descent (if present) fully filled with positive values. Names must be unique within the imported set (same rule as in the editor).
5. Unknown keys at any level are **ignored**, not rejected — keeps the format forward-compatible.

If validation fails, the dialog still opens (so the user sees the file they picked) but shows the validation error block and disables the `Replace` button.

**Confirmation dialog content:**

The dialog mirrors the existing `ImportFlightPlanDialog` shape and shows:
- The file name.
- A short preview: `Aircraft: <model or "—">`, `T/O Config: <config or "—">`, `Regimes: <count>`.
- The impact warning: `N waypoints currently use a regime. After import, regimes that no longer match will revert to Manual on those legs.` (Computed by counting `points.filter(p => p.regimeId).length`.)
- Buttons: `[Cancel]` and `[Replace]` (red/destructive styling — matches the deletion-confirmation pattern).

**Apply step (only on user confirm):**

```
const newAircraft = deepCopy(imported.aircraft);
const importedRegimeIds = new Set(newAircraft.regimes.map(r => r.id));
const newPoints = flightPlan.points.map(p =>
  p.regimeId && !importedRegimeIds.has(p.regimeId)
    ? { ...p, regimeId: undefined }
    : p
);
onFlightPlanUpdate({ ...flightPlan, aircraft: newAircraft, points: newPoints });
```

The plan's other fields (`points` shape, `name`, `theatre`, `initTimeSec`, `initFob`, `bankAngle`, `declination`, `attackPlanning`) are untouched. Auto-persistence picks up the change as usual.

**Where validation lives:**

Frontend-only validation, hand-written. Rationale:
- The performance package is small (a few KB) and self-contained; round-tripping it through the backend just to validate adds latency without value.
- The existing `ImportFlightPlanDialog` posts to the backend because the flight plan involves Pydantic-only constraints (e.g., theatre values) the frontend doesn't enumerate. The performance schema is fully expressible in TypeScript.
- The backend's Pydantic model still validates incoming flight plans that contain the `aircraft` block (kneeboard ingestion path), so the constraint is enforced in both directions.

If we later add a kneeboard-from-perf-file workflow, we can promote validation to a backend endpoint then. Out of scope for this change.

**Trade-off:** validation duplicated between frontend (Zod-style hand-written) and backend (Pydantic). Mitigated by deriving the frontend validator and the Pydantic model from the same `Aircraft` TypeScript shape (D1) — a small wrapper test asserts that a sample valid file passes both.

### D4 — Take-off segment algorithm (wind-corrected ground distance)

The user enters three chart values: `timeSec` (s), `fuel` (lbs), `distance` (NM). Time and fuel are used **verbatim**; ground distance is wind-corrected.

```
TAS_to     = chart.distance / (chart.timeSec / 3600)         // knots, no-wind avg TAS
GS_to      = applyWind(TAS_to, windOrigin, course)           // knots, ground speed
distance_to_ground = GS_to * (chart.timeSec / 3600)          // NM, actual ground distance
time_to    = chart.timeSec
fuel_to    = chart.fuel
```

The chart `distance` is interpreted as no-wind ground distance (equivalent to TAS × time in still air). `applyWind` is the existing helper. Wind correction uses the **origin** waypoint's wind (consistent with how the climb segment's transition uses origin wind in `computeLegSegments`).

**End-of-T/O state:**

- Aircraft position: `distance_to_ground` NM along the leg's course from the origin waypoint.
- Aircraft altitude: `origin.alt` (the take-off run is at field elevation; the climb has not yet started).

The climb segment then runs from `(origin.alt, distance_to_ground)` to `(legAlt, distance_to_ground + climb_distance)`. Cruise covers the remainder.

**Why wind-correct only the distance:**
- Time-to-accelerate is dominated by thrust-versus-mass physics, not wind. Treating it as a constant is consistent with how charts are published.
- Fuel-to-accelerate is `flow × time`; with time fixed, fuel is fixed.
- Distance is a ground-frame quantity: a 20-knot headwind shrinks the ground roll proportionally. Modelling this prevents `T/O distance + climb distance > leg distance` warnings from being noisy in normal headwind conditions.

**Trigger conditions:**

- Leg index = 0.
- Destination waypoint has a `regimeId` matching a regime in the plan.
- `aircraft.takeoff.timeSec > 0 AND aircraft.takeoff.distance > 0`.

If any condition is false, leg 1 falls through to today's 2-phase / level cruise computation.

**Alternatives considered:**
- Apply wind correction to time as well (re-deriving GS during a constantly-accelerating run) — rejected; over-precise given the chart-driven inputs and inconsistent with how other constants are treated in the app.
- No wind correction (verbatim distance) — initially proposed, rejected by user; ground-frame realism is preferred.

### D5 — Long-segment warning extended

Today's warning fires when `transition_distance > leg_distance`. The new rule:

```
if leg_index == 0 AND T/O active:
    if (distance_to_ground + climb_distance) > leg_distance: warning
elif leg_index == 0 AND T/O active AND no climb on regime:
    if distance_to_ground > leg_distance: warning
else:
    existing rule
```

Tooltip content for the warning on leg 1 includes a T/O line so the user can see which segment is over-running.

### D6 — Taxi fuel placement

`taxiFuel` reduces EFR at the **start of leg 1**, before the T/O segment burns its fuel. Concretely, in the leg-calculation loop:

```
previousEfr = flightPlan.initFob - aircraft.taxiFuel   // for leg 0 only
```

For all subsequent legs, `previousEfr` chains as today.

**Why subtract at leg 0 (not at `initFob`):**
- `initFob` is shown elsewhere on the UI as the pre-taxi fuel-on-board (the value the pilot plans against on the ground). Mutating it on load would lose the user's input. Deducting at the leg-calc layer keeps `initFob` pristine and surfaces the taxi cost in the EFR chain.

**For legacy plans:** `taxiFuel = 0` ⇒ no change.

### D7 — Validation: T/O perf is all-or-nothing positive

In the editor:
- All three T/O fields empty (or zero): valid; T/O segment will not be applied.
- All three positive: valid; T/O segment applies.
- Any mixed state (one positive, others zero/empty): invalid; show inline error similar to climb/descent all-or-nothing.

This mirrors the existing climb/descent validation in `RegimeEditor` and avoids ambiguous half-configured states.

### D8 — Perf page layout

A new always-visible header section above the existing left/right split:

```
┌──────────────────────────────────────────────────────────────────┐
│  Aircraft: [_______________]   T/O Config: [_______________]     │
│  Taxi fuel: [____] lbs                                           │
│  T/O perf:  [__:__] mm:ss   [____] lbs   [____] NM     ⓘ         │
│                                                                  │
│  [⬇ Export performance]    [⬆ Import performance]                │
├──────────────────────┬───────────────────────────────────────────┤
│ Regimes              │  Regime editor (unchanged)                │
│  + Add regime        │                                           │
│  • Cruise            │                                           │
│  ...                 │                                           │
└──────────────────────┴───────────────────────────────────────────┘
```

The `ⓘ` icon next to the T/O perf row shows the user-confirmed tooltip:

> *Time, fuel, and distance covered from brake release through acceleration to climb speed. Use values from your aircraft's performance charts for your T/O configuration. Or obtain by flight testing the difference between a cruise climb and the same climb from brake release.*

### D9 — Backend parity and kneeboard surface

Backend changes:

- `flight_plan.py` adds `Aircraft` and `TakeoffPerformance` Pydantic models, attaches `aircraft: Aircraft` to `FlightPlan` (default factory yields zero-config aircraft).
- `compute_leg_segments` (and the leg-data builder) gain the same leg-1 T/O segment logic. The contract test (`test_leg_calc_contract.py`) is extended to cover leg-1 with T/O active.
- `taxiFuel` is subtracted from initial FOB at the start of the leg loop.

Kneeboard surface:

- `waypoint_list_page.py` renders a small header line: `"<aircraftModel> · <takeoffConfiguration>"` (omitted entirely if both are empty). No other kneeboard pages are modified.
- The per-leg time/fuel printed elsewhere on the kneeboard already comes from the same `LegData`; once the backend computes the 3-phase result correctly, those values are right by construction.

### D10 — Migration v1.2 → v1.3

`usePersistedFlightPlan` (and `flight_plan.py` on import) handles two parallel migrations on load:

1. **Synthesise the aircraft object.** If `version === "1.2"`, build `aircraft = { model: "", takeoffConfiguration: "", taxiFuel: 0, takeoff: { timeSec: 0, fuel: 0, distance: 0 }, regimes: [] }`.
2. **Relocate regimes.** If the legacy plan has a top-level `regimes` array (always true for v1.2 plans, per the prior change), move it into `aircraft.regimes`: `aircraft.regimes = legacyPlan.regimes ?? []`. Delete the top-level `regimes` field on the in-memory plan.

After both steps, bump the in-memory version to `"1.3"` so the next save writes the new shape.

All zeros on the new aircraft fields mean: T/O segment is not applied (D4 trigger condition fails), `taxiFuel = 0` is a no-op deduction (D6), and the kneeboard header is suppressed (D9). Combined with the regime relocation (which preserves every regime and every waypoint's `regimeId`), the net effect on a legacy plan is **identical numbers and visuals to v1.2**.

Read sites in the codebase (`flightPlan.regimes` → `flightPlan.aircraft.regimes`) are updated in the same commit as the data-model change. The diff is mechanical (~15–20 sites): `regimeUtils.ts`, `legCalculations.ts`, `PerformancePage.tsx`, `FlightPlanZone.tsx`, `usePersistedFlightPlan.ts`, plus backend `flight_plan.py` and any kneeboard helpers. Tests catch any missed call site.

## Risks / Trade-offs

- **Importing replaces, never merges.** A user who exports a perf package, modifies regimes in another plan's perf package, and re-imports loses any divergent customisation in the active plan. → Mitigated for v1 by the confirmation dialog explicitly calling out the replace; merge support is on the roadmap once we have feedback.
- **Imported regime IDs do not match existing waypoint `regimeId` references.** Almost every leg with a regime binding becomes Manual after import. → Mitigated by the existing orphan-clearing rule (already production code) and by the confirmation copy. Documented as known behaviour.
- **Wind-corrected T/O distance assumes the chart figure is a no-wind ground roll.** Charts that already include a wind component (less common but possible) would be double-corrected. → Mitigated by the tooltip wording, which directs users to no-wind chart values or flight-test deltas. Surface a follow-up if real users report this.
- **One T/O per plan.** Touch-and-go and re-launch missions are not modelled. → Out of scope; flagged in Non-Goals.
- **Taxi fuel is invisible in `initFob`.** A user reading just `initFob` and waypoint-1 EFR will see a delta they have to mentally attribute to taxi. → Mitigated by surfacing taxi fuel prominently in the Perf page header and by including it in the leg-1 tooltip ("Taxi: X lbs deducted before T/O").
- **Backend / frontend math drift.** Any algorithm change risks contract test failure. → Mitigated by explicit parity tests (`test_leg_calc_contract.py`, `test_compute_leg_segments.py`) updated alongside the algorithm change.
- **Relocating `regimes` from `FlightPlan` to `Aircraft` touches ~15–20 read sites.** Mechanical refactor, but a missed call site silently breaks regime lookup. → Mitigated by TypeScript's compile-time errors on the renamed path and by running the existing regime test suite (`regimeUtils.test.ts`, `PerformancePage.test.tsx`, `legCalcContract.test.ts`) before merging.
- **Validation duplicated between frontend (TS) and backend (Pydantic) for the performance file format.** Drift could let one accept what the other rejects. → Mitigated by a small parity test that asserts a hand-crafted valid sample passes the frontend validator AND a hand-crafted invalid sample fails both, plus by keeping the schema small (D2).

## Migration Plan

1. Land the data-model change first: introduce `Aircraft` (with nested `regimes`), add the persistence migration that synthesises the aircraft and relocates regimes (D10), update every `flightPlan.regimes` read site to `flightPlan.aircraft.regimes`. Verify legacy plans load with no behavioural change. This is the largest single commit; everything below builds on it.
2. Land the leg-1 T/O segment (frontend) behind the trigger conditions. Verify no v1.2 plan changes its computed numbers.
3. Land backend parity (Pydantic models, leg-1 algorithm, taxi-fuel deduction). Run the contract test in CI to confirm.
4. Land the Perf page header UI (aircraft fields, T/O perf, tooltip, validation).
5. Land the performance file format and the export/import flow with confirmation dialog.
6. Land the kneeboard waypoint-page header line.

Rollback for any single step is "revert the commit" — there is no shared infrastructure or external system involved.

## Open Questions

None blocking. Two follow-ups to consider after launch:

- Should the export button live only on the Perf page, or also on the flight-plan zone (download menu) for convenience? Deferring to user feedback.
- A dedicated "T/O segment" indicator (e.g., `🛫`) on the leg-1 row, distinct from the existing `↗` glyph. Defer; the tooltip already conveys the breakdown.
