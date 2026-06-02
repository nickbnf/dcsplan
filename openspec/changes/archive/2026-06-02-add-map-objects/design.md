## Context

The app today models a flight plan as a flat `FlightPlan` object with a
`points` array of turn points, an `aircraft` block, and optional
attack-planning fields. There is no concept of annotating the plan with
non-route information (threats, landmarks, mission markers). Two recent
features inform this design:

- `waypoint-comment` introduced per-waypoint free-text notes that are
  rendered on kneeboard pages — the precedent for plan-bound text shown
  on the kneeboard.
- `waypoint-selection` and `waypoint-coordinate-edit` establish the
  interaction vocabulary on the Nav page: single-selection state,
  `#FFB300` orange highlight, click-to-select on map or sidebar,
  Escape / map-background to deselect, DMM slot-fill template overlay
  for coord entry, drag-to-move.

The app is a single-page client (Vite/React/TypeScript) with a Python
backend used for validation on import; flight plans are persisted only
in localStorage and as JSON files (no backend storage, no accounts).
A single flight plan is in memory at any time. This single-plan-in-memory
constraint shapes several design decisions below.

## Goals / Non-Goals

**Goals:**

- Let pilots accumulate a library of durable landmarks and known threats
  per theatre, curated once and reused across plans.
- Let pilots annotate individual plans with both library references and
  one-off plan-local markers, with per-plan comments where relevant.
- Render those objects on kneeboard leg pages so they are visible in
  flight.
- Keep flight plan JSON files **standalone** so they can be shared
  without also shipping a library.
- Reuse Nav-page interaction patterns on every new surface so the user
  learns nothing new beyond the data model.

**Non-Goals:**

- Replace or extend the route data model itself (waypoints stay
  unchanged).
- Auto-route around threats or warn when route enters a threat ring
  (deferred).
- Provide multi-plan, archival, or cross-theatre reference behaviour.
- Synchronise libraries between users automatically (sharing is via
  JSON files for v1).
- User-uploadable pictograms; the catalog is closed in v1.

## Decisions

### D1. Two capabilities: `theatre-library` and `map-objects`

The feature naturally splits along a clear seam:

- The **library** has its own lifecycle (theatre-scoped, mutable across
  plans, JSON-loadable, has its own management UI). Its requirements
  are about storage, persistence, and CRUD.
- **Map objects in plans** have a different lifecycle (plan-bound,
  combine library refs with plan-local markers, surface in the sidebar
  and on the kneeboard, embed in plan files on export).

Splitting mirrors the precedent of `waypoint-selection` /
`waypoint-coordinate-edit` (separate focused specs rather than one
monolithic "waypoint" capability). It also lets the library be tested
and reasoned about independently of the planner.

**Alternative considered:** one capability `map-objects` covering
everything. Rejected because the library page and the planner Objects
tab are independent surfaces with different invariants; conflating
them would make either spec harder to read.

### D2. Library-with-refs storage, snapshot-on-export

The library lives outside the flight plan (theatre-scoped localStorage).
The flight plan stores `libraryRefs: { uuid, comment? }[]` plus a
plan-local `markers: PlanMarker[]`. **However, on export, the JSON file
embeds a full snapshot of every referenced library entry** so the file
remains standalone.

This resolves the tension between two desirable properties:

- **In-app** the user wants a single source of truth ("fix the SAM
  position once, every plan picks it up").
- **Files on disk** must be shareable on Discord, archived, or sent to
  a teammate without also shipping the library.

Snapshot-on-export gives both: live editing of the library propagates
inside the app, while exported files freeze the state at the moment of
export.

**Alternative considered:** pure embedded model (each plan contains its
own copy of every object). Rejected because the user explicitly wanted
the library to be the single editable source for landmarks across many
plans.

**Alternative considered:** pure ref model (refs only, no snapshot).
Rejected because it makes plan files unusable without the library.

### D3. Import-merge conflict resolution: library wins

When importing a plan whose embedded snapshot contains an object with
the same UUID as an existing library entry but different data, **the
existing library entry is kept unchanged**; only UUIDs not yet present
are added.

**Why:** the alternative (snapshot wins) would silently rewind the
user's library when loading an old plan, which is dangerous. Asking
per-conflict (snapshot vs library) is annoying for the common case.
The escape hatch for "I really want this version" is to delete the
library entry first, then re-import.

The user is shown a small summary ("N added, M existing kept") to
maintain transparency.

### D4. Single-plan-in-memory simplifies delete

Because only one plan is in memory at a time, deleting a library entry
is well-defined: we check the current plan for a reference and offer
to remove it. Archived plans on disk are irrelevant to the operation;
if a deleted entry is later re-loaded via a plan file, it returns
through the snapshot-merge path (see D3).

This sidesteps the more painful "library entry referenced by N plans"
problem entirely. If the app later grows multi-plan-in-memory, the
deletion confirmation will need to widen.

### D5. Closed pictogram catalog with two type categories

The catalog is a fixed set of SVGs shipped in code (~10–20 types in
v1). Types are partitioned into two categories:

- **Ranged** (threats): the entry has a `range` field; on the map a
  range ring is drawn around the pictogram.
- **Non-ranged** (landmarks, friendly, reference): no range field;
  no ring.

The category is a property of the *type definition*, not of the
individual entry. This keeps the data model simple and the conditional
UI (show/hide the range field, draw/skip the ring) trivially derived
from the type.

**Alternative considered:** every object has an optional `range`,
shown for types that "usually" have one. Rejected because it muddles
the model — a SAM site without a range is meaningless; a landmark
with a range is confusing. Tying range presence to the catalog type
keeps invariants clean.

**Deferred:** user-uploadable pictograms (added in a later change if
demand emerges). The closed catalog also keeps the kneeboard renderer
honest: every pictogram has a known SVG size and anchor.

### D6. Map crop is the filter for kneeboard rendering

A leg page renders **every plan object whose position falls inside the
leg's existing map crop**. There is no separate "visibility radius",
no per-leg assignment, no along-track ordering.

The user curates which objects belong to the plan during the
decorating step; the crop then filters geographically by what is
visible. Threat range rings render whenever the ring intersects the
crop, even if the center is off-crop — so an off-map SAM still
warns by an encroaching arc.

**Alternative considered:** per-object `visibilityRadius` driving
filtering. Rejected as over-engineering; the crop already encodes
"what is geographically relevant to this leg".

**Trade-off accepted:** an object very close to the leg path but
just outside the natural crop bounds will not appear. The user can
include it by widening the crop manually if needed. Auto-widening
crop is explicitly out of scope.

### D7. Consistency-with-Nav as a first-class design constraint

Every interaction on a new surface (Objects tab on the planner,
Theatre Library page) reuses an existing Nav-page pattern when one
exists:

| New surface concern        | Reused pattern                    |
| -------------------------- | --------------------------------- |
| Single-entity selection    | `waypoint-selection` contract     |
| Position editing by typing | `waypoint-coordinate-edit` (DMM)  |
| Position editing by drag   | Existing waypoint drag handler    |
| Add by clicking on map     | "Add Wpts" toggle pattern         |
| Import JSON                | `ImportFlightPlanDialog` shape    |
| Export JSON                | Existing download link pattern    |

Concretely this constrains implementation: where a generalisation is
cheap (parameterise the coord-entry overlay's commit action), we
generalise. Where it is not (selection state for different surfaces),
we create parallel contexts (`LibrarySelectionContext`) that obey the
same UX contract without sharing state. The principle is uniformity
of *user behaviour*, not necessarily of *implementation*.

### D8. Asymmetric map interaction: click adds, sidebar removes

In the planner's Objects tab, clicking a greyed library pictogram on
the map **adds** it to the plan. Clicking an already-included
pictogram **selects** it (highlights its sidebar card). Clicking
nothing **never removes**. Removal is only via the sidebar card's 🗑
button.

The asymmetry is deliberate: adding is reversible and frequent;
removing should require an explicit action to avoid losing a per-plan
comment on a stray click. The cost (slightly more friction to remove)
is justified by the safety.

### D9. Type-stamped Add toggle

The "+ Add Marker" button (planner Objects tab) and "+ Add Object"
button (Library page) follow the structure of the existing "Add Wpts"
toggle, with one addition: the button shows the currently-selected
type and exposes a dropdown to change it.

```
[+ Add: ▲ Landmark ▾]
```

While the toggle is active, the cursor renders the selected pictogram
and each map click drops one entry of that type. Coord-entry mode
(`N`/`S`/digit triggers) works inside this mode, just as it does for
waypoint placement.

**Alternative considered:** drop a generic-typed entry on click, edit
the type after. Rejected because the pictogram *is* the type — placing
a SAM but seeing a question-mark icon until you fix it is misleading,
and batch-placing several SAMs in a row is a real use case.

## Risks / Trade-offs

- **Map clutter when the library is large.** With ~50+ entries on
  screen, greyed ghosts plus included pictograms plus range rings
  plus route plus waypoints can be visually noisy. **Mitigation:**
  v1 accepts overlap; the user can zoom in. Decluttering is on the
  deferred list.
- **Kneeboard label collisions.** Comments drawn next to pictograms
  on a leg crop may overlap each other or the route. **Mitigation:**
  v1 accepts collisions; the user can edit which objects are included
  if a particular leg is unreadable. Smart label placement is future
  polish.
- **Greyed library threats hide their range rings.** A user deciding
  whether to include a SAM cannot see its lethal reach without first
  including it. **Mitigation:** include-then-decide is cheap (one
  click in, one click out). Showing greyed rings was rejected for
  v1 to keep the browsing map readable. Revisit if user feedback
  contradicts.
- **Library lives only in localStorage.** A user clearing their
  browser data loses their library. **Mitigation:** the Export
  Library JSON action provides a manual backup; curated theatre packs
  shipped with the app give a baseline starting point. Backend
  persistence is a separate future change.
- **Range-as-library-property prevents "degraded today" overrides.**
  A user who wants to model that a SAM is operating at reduced range
  for today's sortie has no per-plan range override field.
  **Mitigation:** the per-plan comment field is the right place for
  such notes ("treat as 15 NM today"). Adding a per-plan override is
  deferred until the comment workaround proves insufficient.
- **Single-plan-in-memory assumption baked into delete UX.** If the
  app gains multi-plan-in-memory or background tabs later, the
  delete confirmation needs to widen to detect references in other
  loaded plans. **Mitigation:** the delete-confirmation flow is
  centralised, so the change is localised when needed.
- **No backend means no cross-device library sync.** A user planning
  on two machines must manually export/import the library JSON.
  **Mitigation:** acknowledged; backend account work is the proper
  solution.

## Migration Plan

This change is purely additive at the data layer:

- `FlightPlan.libraryRefs` and `FlightPlan.markers` are new optional
  arrays. Legacy plans without these fields load with empty arrays.
- `FLIGHT_PLAN_VERSION` is bumped (currently `1.3` → `1.4`); the
  importer accepts both, defaulting absent collections to `[]`.
- The library localStorage namespace is new; absence of a key means
  "empty library for this theatre", not an error.

No rollback is needed — disabling the feature in code degrades
gracefully (the new collections are just ignored).

## Open Questions

- **Exact pictogram catalog for v1.** Which ~10–20 types ship, with
  which SVGs, in which category (ranged vs not). Resolved during
  implementation; the catalog is a code constant.
- **Library JSON schema versioning.** A `LIBRARY_FILE_VERSION` mirrors
  `FLIGHT_PLAN_VERSION`; the concrete format (and whether backend
  validation is added day-one) is decided during implementation.
- **Top-nav placement and label for the Library page.** "Library",
  "Theatre Library", or grouped under a new "Theatre" menu — UI
  detail resolved during implementation.
- **Curated starter theatre packs.** Whether v1 ships any curated
  JSONs (Caucasus, Syria, ...) or just leaves the library empty until
  the user populates it. Out of scope for this change's spec, but
  worth flagging for follow-up work.
