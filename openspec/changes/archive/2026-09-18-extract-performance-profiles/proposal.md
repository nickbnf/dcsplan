## Why

A space will hold **multiple** named performance profiles that many plans share, but today the app stores exactly **one** unnamed, unidentified profile (`dcsplan.performance`, a single blob) that applies implicitly to whatever plan is open. Before plans can be plural (C1+) or shared (C2+), a profile has to become a thing you can name, point at, and choose between.

This is the largest data-model change in the centralized-flight-plans programme (AD-2) and the only part of it that needs **no backend at all** — so it ships first, standalone, and de-risks everything after it.

## What Changes

- **Profiles become named entities.** In the anonymous tier, the single profile gains a user-editable name but no id (id is server-assigned on sign-in adoption). In the signed-in tier, profiles become a server-backed keyed collection with stable ids.
- **Plans reference a profile (signed-in only).** `FlightPlan` gains `profileId` in the signed-in tier. Anonymous users have one implicit profile — no reference needed.
- **Per-plan profile chooser (signed-in only)** — net-new UI. Anonymous users have one profile; signed-in users choose which profile a plan flies.
- **Profile CRUD on the Performance page (signed-in only)**: create, rename, duplicate, delete, plus switching which profile is being edited. Anonymous users see the existing single-profile editing interface, with a name field added.
- **One-time localStorage migration** — the existing single blob gains an id and a default name, moves into the collection, and the stored plan's `profileId` is pointed at it. Synchronous, pre-mount, same pattern as the existing `bootstrapPerformanceFromLegacyPlan()`.
- **Spec drift corrected.** `aircraft-performance` and `performance-regime` still assert that the aircraft block and regime collection live *on the flight plan*. That stopped being true at the 1.5 migration, which moved them to `dcsplan.performance` without updating the specs. Both are restated against reality as part of this change.
- **BREAKING (storage):** the `dcsplan.performance` key's shape changes. Covered by the migration; no user action required.
- **BREAKING (file format):** the exported `.perf.json` package gains profile identity, and exported plans record which profile they used. Import of older files continues to work.

## Capabilities

### New Capabilities
- `performance-profile`: profiles as first-class named entities. Anonymous tier: one named profile with no id (id assigned server-side on sign-in adoption), implicit reference, import replaces. Signed-in tier: server-backed collection with stable ids, profile CRUD, per-plan `profileId` reference and chooser, additive import, and the behaviour when a plan's regime references don't exist in the profile it points at. Migration from the single-blob store (both tiers).

### Modified Capabilities
- `aircraft-performance`: the "Aircraft block on the flight plan" requirement is wrong as written (the block has lived in a separate store since 1.5) and is restated as a standalone entity owned by the profile. Performance-package export/import requirements gain profile naming; anonymous import remains replace, signed-in import becomes additive.
- `performance-regime`: "Performance regime collection on flight plan" is likewise restated — regimes are owned by a profile and resolved through it. Waypoint `regimeId` resolution is scoped to the profile. D11 de-mirroring: bound-leg TAS/FF resolved from regime at read time, no mirrored copy.

## Non-goals

- **No backend.** No server, no database, no sync, no accounts. Entirely front-end; localStorage remains the only store.
- **No wire-format cleanup.** The backend still expects `aircraft` nested inside `flightPlan`, with the frontend marshalling it in and out. Deliberately deferred to C2 `add-cloud-sync`, where the wire format is being reshaped anyway — keeping this change front-end only.
- **No spaces, sharing, or versioning.** Profiles become *identified*, not *space-owned* (AD-1) or *versioned* (AD-5). Those arrive with the server.
- **No multiple plans.** Still one plan; it simply now names the profile it uses.
- **No change to regime semantics** — leg computation, climb/descent, take-off segment, and taxi fuel all behave exactly as today.

## Impact

**Storage** — `dcsplan.performance` shape change + migration. `legacyMigration.ts` (extend), `performanceStorage.ts` (singular API → collection API: `loadPerformance`/`savePerformance`/`hasStoredPerformance` all assume one blob).

**Types** — `packages/frontend/src/types/flightPlan.ts`: `FlightPlan` gains `profileId`; `PerformanceFileV1` gains identity; `VersionedFlightPlan.performanceSnapshot` records which profile it snapshotted. `FLIGHT_PLAN_VERSION` and `PERFORMANCE_FILE_VERSION` both bump.

**State** — `contexts/PerformanceContext.tsx` currently exposes exactly one `performance: Aircraft` and autosaves it on every change; it becomes a collection plus a selection, and every consumer of `usePerformance()` is affected.

**UI** — `components/PerformancePage.tsx` (profile switching + CRUD), `PerformanceImportDialog.tsx`, and wherever the chooser lands in the plan sidebar (`components/sidebar/`).

**Export/import** — `utils/flightPlanUtils.ts` (`downloadFlightPlan`, `downloadAircraft`), `utils/performanceImport.ts`, `components/sidebar/ImportFlightPlanDialog.tsx` (already falls back to `flightPlan.aircraft` for pre-1.5 files — that path stays).

**Computation** — `utils/legCalculations.ts` and `attackPlanningUtils.ts` take `aircraft: Aircraft` as a parameter, so they are largely unaffected; only their call sites change to pass the *selected* profile.

**Backend** — unchanged in this change. `GenerateDialog.tsx` continues to marshal `aircraft` into the plan body for the kneeboard endpoint (see Non-goals).

**Decided in design:** switching a plan to a different profile (signed-in only) resets all bound legs to Manual after confirmation (D5). Anonymous users have one profile, so the question doesn't arise.
