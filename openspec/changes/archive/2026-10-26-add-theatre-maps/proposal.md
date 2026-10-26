# Proposal

## Why

Each theatre today has exactly one map: one tile set, one projection, one look for the planner map and the generated kneeboard. We want several maps per theatre (e.g. a different chart style or projection) without touching the flight plan or library. Today the theatre config also drives the flight plan calculations: projection, tile grid and navigation mode are all in one file. A map switch would therefore change headings, distances and turn geometry. The navigation side has to be split from the display side first.

## What Changes

- Introduce a **root → theatre → map** hierarchy. A theatre owns its name, its navigation settings and a default map. Each map owns its display projection, tile grid, bounds and tiles.
- **Split navigation from display.** Navigation settings (mode and projection used for bearings, distances and turns) move into an explicit `navigation` block on the theatre. They are used by the frontend leg calculations and the backend `flight_plan.py`, and never vary with the chosen map. Initially they copy the default map's projection.
- **Per-user map choice**, one per theatre, held in browser local storage on the device (both tiers). An unknown or missing choice falls back to the theatre's default map.
- A **map selector in `DisplayControls`** on the planner. The choice applies to every map view of that theatre, including the Theatre Library page map.
- **Kneeboard generation uses the selected map.** The request carries a map id. A request without one uses the default map. The generate dialog gets no extra selector.
- **Legs stay straight lines** on every map, drawn between the endpoints converted into that map's projection. Printed headings and distances come from the navigation settings and are identical across maps. A small angle between the printed heading and the drawn line is accepted.
- When switching maps, the **saved view is converted**: the centre is carried through lat/lon and the zoom is matched by scale (metres per pixel), not by zoom index.
- **BREAKING (static config/URLs):** theatre configs move from `backend/theatres/<id>.json` to a per-theatre directory with `theatre.json` plus `maps/<map>.json`. Tiles move under `tiles/<theatre>/<map>/`. The three existing theatres (Caucasus, Syria, Germany) are converted once into a single `default` map each. No fallback reader for the old layout. Theatre ids are unchanged, so plans and libraries are unaffected.

## Non-goals

- Lambert conformal conic support in the backend (kneeboard and `flight_plan.py`). It stays frontend-only, as today, until a planned map needs it.
- Storing the map choice in the plan (Yjs), the space, or the user account. It is not synced across devices or collaborators.
- A map selector in the kneeboard generation dialog.
- Curving legs to follow navigation geometry on non-matching display projections.
- Warning when waypoints fall outside the selected map's bounds.
- New maps or tile sets. This change provides the mechanism and migrates the existing maps only.
- Any change to the library, plan, sync or versioning model (AD-1, AD-6, AD-17 unaffected: maps are static config, not space-owned entities).

## Capabilities

### New Capabilities
- `theatre-maps`: the theatre/map hierarchy, the navigation-vs-display split, per-device map selection and its fallback, map switching (including view conversion), and how the selected map drives the planner map, the Library page map and kneeboard rendering.

### Modified Capabilities
<!-- None: no existing spec covers map display, theatre configuration or kneeboard rendering. The Library page's map requirement ("a map on the right showing all entries") still holds; which map it shows is specified by theatre-maps. -->

## Impact

- **Backend:** `main.py` (`/theatres`, `/theatres/{id}.json`, `/tiles/...` routes gain a map level), `kneeboard.py` (`_get_map_info`, `_fetch_tile`, `KneeboardRequest` gains a map id), `overview_map_page.py`, `flight_plan.py` (`_load_theatre_config` / `_create_transformer` read the navigation block), `backend/theatres/` layout, tile directory layout.
- **Frontend:** `Map.tsx`, `LibraryMap.tsx`, `map/DisplayControls.tsx`, `hooks/useTheatres.ts`, `config/api.ts` (`getTilesBaseUrl`), `utils/tileLayer.ts` (`MapInfo` type), `utils/legCalculations.ts` callers (navigation projection is no longer the display projection), `utils/mapViewState.ts`, `sidebar/GenerateDialog.tsx` (sends the map id), new local-storage key for the per-theatre choice.
- **Tools:** `packages/tools/scripts/generate_tiles.py` emits a map config and tiles for one map of a theatre.
- **Deployment:** tile files on the server must be moved to the new directory layout alongside the release.
