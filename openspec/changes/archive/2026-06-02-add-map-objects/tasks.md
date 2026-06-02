## 1. Foundation: types, pictogram catalog, storage

- [x] 1.1 Add `LibraryObject`, `PlanLibraryRef`, `PlanMarker` types in `packages/frontend/src/types/flightPlan.ts`; add optional `libraryRefs` and `markers` collections to `FlightPlan`; bump `FLIGHT_PLAN_VERSION` to `1.4`; add `LIBRARY_FILE_VERSION` constant
- [x] 1.2 Define the closed pictogram catalog (~10–20 types) as a code module: SVGs + per-type `{ id, label, category: 'landmark' | 'threat' | 'friendly' | 'reference', isRanged: boolean }`
- [x] 1.3 Implement per-theatre library storage layer (read/write/clear against localStorage with key `dcsplan.library.<theatreId>`); empty key returns empty array
- [x] 1.4 Implement `LibraryFile` JSON shape, validation, and parse/serialise functions (round-trip plus version check)
- [x] 1.5 Unit-test round-trip serialisation of library entries, plan library refs, and plan markers; verify legacy plan (1.3) loads with empty new collections

## 2. Shared interaction infrastructure

- [x] 2.1 Generalise the coord-entry overlay component so the commit action is parameterised (instead of hard-coded `moveTurnPoint`/`addTurnPoint`); existing waypoint flows must continue to work unchanged
- [x] 2.2 Add `LibrarySelectionContext` (single selected entry by UUID; same shape as `WaypointSelectionContext`) and a parallel selection context for in-plan objects in the planner Objects tab
- [x] 2.3 Extract the "type-stamped Add toggle" button into a reusable component (dropdown for type + toggle for placement mode + cursor pictogram); will be used by Add Object (Library page) and Add Marker (Objects tab)

## 3. Theatre Library page (`/library`)

- [x] 3.1 Scaffold `TheatreLibraryPage.tsx` and route at `/library`, parallel to `AttackPlanningPage.tsx`; add a top-nav entry alongside Performance/Attack
- [x] 3.2 Build the side-by-side layout: scrollable list panel + map panel; map renders library entries only (no route, no waypoints, no markers); auto-zoom to library bounds on page load
- [x] 3.3 Implement the library entry card: pictogram picker, name, read-only coordinates, range field (conditional on `isRanged`), default comment editor; auto-save on every change
- [x] 3.4 Wire selection: `#FFB300` highlight on card + map pictogram; click either to select; map background click and Escape to deselect; `+` / `-` cycling
- [x] 3.5 Wire coord entry on a selected entry (via the generalised overlay from 2.1) — `N`/`S`/digit triggers; Return commits to the entry; Escape cancels
- [x] 3.6 Wire pictogram drag on the map to update entry position; drag cancels any in-progress coord entry
- [x] 3.7 Wire the type-stamped Add Object toggle (from 2.3) to create new library entries on map click or coord commit
- [x] 3.8 Implement library entry deletion with confirmation; if the current plan references the entry, dialog states this and confirm removes the ref from the plan too
- [x] 3.9 Implement Export Library JSON download
- [x] 3.10 Implement Import Library dialog: file picker, validate, preview "added vs kept" counts, opt-in Replace checkbox; merge or replace on confirm

## 4. Theatre-switch confirmation

- [x] 4.1 Extend `ChangeTheatreDialog` text to mention the library being blanked when the current theatre's library is non-empty; clear the library alongside the flight plan on confirmation

## 5. Plan data model: snapshot-on-export, merge-on-import

- [x] 5.1 On flight plan export, embed full library snapshots for every UUID in `libraryRefs` into the JSON file; keep markers inline as plain plan data
- [x] 5.2 On flight plan import, merge snapshot UUIDs into the current theatre's library (new added, existing kept); show summary of added vs kept counts
- [x] 5.3 Update `ImportFlightPlanDialog` to surface the snapshot-merge summary alongside existing flight plan validation
- [x] 5.4 Unit-test snapshot embedding (all referenced library entries present) and merge semantics (existing UUIDs unchanged on import)

## 6. Planner sidebar: Objects tab

- [x] 6.1 Introduce top-level tabs in `Sidebar.tsx` above the scrolling region: Flight Plan (existing `FlightPlanZone`) and Objects (new); preserve other-tab scroll/edit state on switch; keep Generate button at the bottom
- [x] 6.2 Build the Objects zone empty state with hints to use the map or library
- [x] 6.3 Build the library-ref card: read-only pictogram/name/coords/range from the library entry, editable per-plan comment override (inline textarea matching the waypoint comment pattern), default-comment preview as fallback, delete control
- [x] 6.4 Build the marker card: editable pictogram picker (range field appears/hides based on type), name, read-only coords, range (if ranged), comment, delete control
- [x] 6.5 Wire the type-stamped Add Marker toggle (from 2.3) to create plan-local markers on map click or coord commit
- [x] 6.6 Wire selection in the Objects tab: `#FFB300` highlight on card + map pictogram; click card or pictogram to select; map background or Escape deselect; `+` / `-` cycling
- [x] 6.7 Wire coord entry for a selected marker (no-op for selected library ref); Return commits, Escape cancels
- [x] 6.8 Wire drag for a marker on the planner map; library-ref drags are inert (position owned by library)
- [x] 6.9 Add "Manage Library" link in the Objects tab routing to `/library`

## 7. Planner map: object layers

- [x] 7.1 Add the in-plan pictogram layer (coloured) — always visible regardless of tab; identical visuals for refs and markers of the same type
- [x] 7.2 Add the threat range ring layer for in-plan ranged objects; z-order beneath route+waypoints, above pictograms
- [x] 7.3 Add the greyed library ghost layer — visible only when the Objects tab is active; no range rings; reduced opacity / monochrome
- [x] 7.4 Wire click behaviours: greyed pictogram → add `libraryRef` to plan; coloured pictogram → select corresponding card in sidebar (scroll into view); no map gesture removes
- [x] 7.5 Wire hover tooltips: greyed shows name only; coloured shows name + effective comment + range (if applicable)
- [x] 7.6 Verify final map z-order on the planner: pictograms (bottom), threat range rings, waypoints, route (top)

## 8. Kneeboard rendering

- [x] 8.1 Extend leg-page generation to render every plan object (ref or marker) whose position falls inside the leg's existing map crop, drawing its pictogram at the correct projected position
- [x] 8.2 Render inline comment labels next to pictograms using a small font and a semi-transparent background matching the existing waypoint comment box style; effective comment is per-plan override (ref) → library default (ref) → marker comment (marker); skip when empty
- [x] 8.3 Render threat range rings on leg pages whenever the ring intersects the crop, including arc fragments when the threat centre is outside the crop
- [x] 8.4 Ensure z-order on leg pages matches the planner: pictograms bottom, threat rings, waypoints, route top
- [x] 8.5 Visual-check generated kneeboards on a representative plan with mixed landmarks, threats, and markers across multiple legs

## 9. Cross-cutting QA

- [x] 9.1 Verify legacy flight plan files (without `libraryRefs`/`markers`) still load and render correctly
- [x] 9.2 Verify theatre switching blanks the library and clears in-plan refs as the plan is reset
- [x] 9.3 Verify a deleted library entry is removed from the in-memory plan's refs in the same operation
- [x] 9.4 Verify reload persistence: library entries, plan refs, and plan markers all survive a browser reload
- [x] 9.5 Manual end-to-end run: build a plan, decorate via map ghosts + Add Marker, generate the kneeboard, confirm objects appear correctly on the leg pages
