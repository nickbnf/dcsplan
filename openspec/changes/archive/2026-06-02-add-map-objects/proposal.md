## Why

Pilots need to annotate flight plans with threats, landmarks, and other
points of interest so they appear on the kneeboard for in-flight reference.
Today a plan contains only the route — there is no way to capture "the
radio tower visible from 30 NM north of the IP" or "today's SA-6 site
between waypoints 3 and 4". This change adds custom map objects to plans,
backed by a per-theatre library so that durable landmarks can be curated
once and reused across plans, while one-off mission markers stay private
to the plan that needs them.

## What Changes

### Data model

- **NEW**: A per-theatre **object library** stored in localStorage.
  Each entry has a pictogram, position, optional default range (threats
  only), and optional default comment. The library is mutable; entries
  can be loaded from JSON files so curated theatre packs can ship with
  the app or be shared between users.
- **NEW**: Flight plans gain two new collections:
  - `libraryRefs`: references (by stable UUID) to library entries, each
    with an optional per-plan **comment override**.
  - `markers`: plan-local objects (one-off threats, mission-specific
    notes) with their own pictogram, position, range, and comment.
- Pictogram catalog is **closed** (curated SVG set shipped in code,
  ~10–20 types; extended by adding code in future releases). Each type
  is either "ranged" (threats) or "non-ranged"; the range field only
  appears for ranged types.
- Range units are NM, consistent with the rest of the app.

### Sidebar (planner page)

- **NEW**: Top-level tabs appear above the scrolling region. The
  existing flight plan list lives behind a "Flight Plan" tab; a new
  "Objects" tab shows the objects currently in the plan (refs + markers).
- **NEW**: In the Objects tab the user adds plan-local markers via a
  **type-stamped "+ Add Marker" button** (a toggle button that mirrors
  the existing "Add Wpts" pattern: pick a type from its dropdown, then
  click on the map to drop markers of that type until the toggle is
  released).
- **NEW**: The map displays greyed pictograms for library entries not
  yet included; clicking a greyed pictogram adds it to the plan
  (becomes colour). Clicking an already-included pictogram on the map
  highlights its card in the sidebar. Removal happens only from the
  sidebar card — clicking on the map never removes (avoids accidents).
- Per-plan comment editing on cards mirrors the existing waypoint
  comment inline editor.

### Theatre Library page

- **NEW**: A top-level **Theatre Library** page at `/library`, parallel
  to `/attack` and `/performance`. Side-by-side layout: scrollable list
  of library entries on the left, map showing all entries on the right.
  Accessible both from the top navigation and from a "Manage Library"
  link in the planner's Objects tab.
- **Consistency principle**: the Library page reuses Nav-page interaction
  patterns wherever they apply, so the user can transfer everything they
  already know. In particular:
  - **Selection** mirrors `waypoint-selection`: a single selected entry,
    `#FFB300` orange highlight on both the card and the map pictogram,
    click either to select, click the map background to deselect,
    `Escape` to deselect, `+` / `-` keyboard cycling.
  - **Coordinate entry** mirrors `waypoint-coordinate-edit`: there is no
    coordinate text field on the card; with an entry selected, pressing
    `N` / `S` / a digit activates the DMM slot-fill template on the map
    overlay, `Return` commits (moves the entry), `Escape` cancels.
  - **Drag** to move on the map works the same way as waypoint drag,
    including cancelling an in-progress coord entry when used.
  - **Import / Export** uses the same dialog shape and file picker as
    `ImportFlightPlanDialog`.
  - **Adding an entry** uses the same type-stamped toggle button as
    "+ Add Marker" on the planner: pick a type, then click the map or
    use keyboard coord entry to place. The button stays active for
    batch placement until toggled off.
- The map on the Library page shows only library objects (no route,
  no waypoints, no plan markers) so curation stays focused.
- Auto-zoom to library bounds on page load.

### Kneeboard

- **NEW**: Leg pages render every plan object whose position falls
  inside the leg's map crop, with comment labels drawn inline next to
  each pictogram. Threat range rings render whenever they intersect
  the crop, even when the threat's centre is off-crop (the arc creeps
  in from the edge).
- Z-order on the map: route on top, threat rings beneath, pictograms
  beneath rings.

### Import / export and persistence

- **CHANGED**: Flight plan JSON format snapshots full data for every
  referenced library entry on export so plan files remain standalone.
  Import merges new entries into the library; existing UUIDs are kept
  unchanged (current library wins). A confirmation surface tells the
  user how many entries will be added vs kept.
- **NEW**: Library JSON files have their own version constant. Library
  import defaults to merge; an explicit "Replace" opt-in is available
  for clean-slate workflows.
- **CHANGED**: Theatre switching blanks the library along with the
  flight plan, reusing the existing confirmation dialog (updated to
  mention the library).

## Capabilities

### New Capabilities

- `theatre-library`: data model, theatre scoping, mutation, persistence
  (localStorage for v1), JSON import/export of the library, and the
  top-level Theatre Library management page. Interaction patterns
  (selection, coord entry, drag, import dialog) re-use the contracts
  established by `waypoint-selection` and `waypoint-coordinate-edit`.
- `map-objects`: in-plan objects (library refs + plan-local markers),
  the Objects sidebar tab, map-based picking via greyed ghosts, the
  type-stamped Add Marker workflow, snapshot embedding in exported
  flight plans (and merge on import), and kneeboard rendering of
  objects on leg pages.

### Modified Capabilities

(none — flight plan JSON format changes are introduced as part of the
new `map-objects` capability and no existing spec's requirements
change)

## Impact

- **Types** (`packages/frontend/src/types/flightPlan.ts`): new
  `LibraryObject`, `PlanLibraryRef`, `PlanMarker` types; `FlightPlan`
  gains `libraryRefs` and `markers` collections; `FLIGHT_PLAN_VERSION`
  bumped; new `LIBRARY_FILE_VERSION` constant for library JSON files.
- **Storage**: new localStorage key namespace for per-theatre libraries
  (e.g., `dcsplan.library.<theatreId>`).
- **UI — sidebar** (`Sidebar.tsx`, `sidebar/`): introduce top-level tabs
  above the scrolling region; existing `FlightPlanZone` lives behind a
  "Flight Plan" tab, new `ObjectsZone` lives behind an "Objects" tab.
  Generate button placement preserved. New type-stamped Add Marker
  toggle button shares structure with the existing Add Wpts toggle.
- **UI — map** (`components/Map.tsx`, `components/map/`): new layers for
  plan objects (always visible), greyed library ghosts (visible only
  in the Objects tab of the planner; visible in their full state on
  the Library page), threat range rings, hover name tooltips,
  click-to-include affordance for greyed pictograms, click-to-highlight
  for included pictograms, and pictogram drag for position editing.
- **UI — new page**: `TheatreLibraryPage.tsx` at route `/library`,
  parallel to `AttackPlanningPage.tsx`. Top-nav entry added.
- **Selection context**: a new `LibrarySelectionContext` parallel to
  `WaypointSelectionContext` (separate state because the surfaces are
  different pages; identical UX contract).
- **Coord entry**: generalise the existing coord-entry overlay so the
  commit action (`moveTurnPoint` / `addTurnPoint` today) is
  parameterised. The Library page wires in `moveLibraryObject` /
  `addLibraryObject`; the planner's Add Marker mode wires in
  `addPlanMarker` / `movePlanMarker`.
- **Kneeboard**: extend leg-page generation to render objects whose
  positions fall inside the crop, with inline comment labels and
  threat range rings.
- **Import/export**: extend `ImportFlightPlanDialog` and the download
  flow to embed the library snapshot inside the plan file on export,
  and merge new UUIDs into the library on import. A parallel
  `ImportLibraryDialog` follows the same dialog shape for the Library
  page.
- **Theatre switch**: extend the existing confirmation in `Sidebar.tsx`
  to also warn that the library will be blanked.
- **No backend impact** for v1 (localStorage only). A future backend
  account feature will need to migrate library storage server-side
  and may need server-side validation endpoints for library JSON
  (mirroring the existing flight plan import validation).

### Out of scope for v1 (deferred)

- Pictogram decluttering at low zoom on the map (overlap accepted).
- User-uploadable pictograms.
- Per-plan range override (range is a property of the threat, not the
  day; users use the per-plan comment to note "degraded today").
- Per-leg force include/exclude of an object.
- Auto-warn when the route enters a threat ring.
- Greyed-state range rings (only included threats show their ring).
- Crop bounds being influenced by nearby-but-just-outside objects.
- Cluster icons / object decluttering on map at low zoom.
- Multi-select / batch operations on the Library page.
- "Edited but not exported" indicator on the Library page.
- Library entry deletion that detects references in *archived* plans
  (single-plan-in-memory model means we only check the current plan).
