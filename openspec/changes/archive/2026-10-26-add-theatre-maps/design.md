# Design

## Context

See proposal.md for motivation and specs/theatre-maps/spec.md for the behaviour contract.

Today one file, `backend/theatres/<id>.json`, plays two roles:

- **Display.** Projection, tile grid (`origin_*`, `ref_corner_ne_*`, `zoom_info`, `tileSize`) and `bounds` feed the OpenLayers view and tile layer (`Map.tsx`, `LibraryMap.tsx`, `utils/tileLayer.ts`, `utils/projectionUtils.ts`) and the kneeboard tile compositor (`kneeboard.py`, `overview_map_page.py`).
- **Navigation.** `navigation_mode` plus the same projection drive bearings, distances and turn geometry: on the frontend through `legCalculations.ts` (`calculateAllLegData`, `calculateAllLegDrawData`), on the backend through `flight_plan.py` (`FlightPlanData` loads the theatre file and builds its own transformer).

On the frontend the navigation projection reaches the calculations through the map. `Map.tsx` builds the display projection, publishes `{projection, navigationMode}` through `onMapNavInfoChange`, and `PlannerApp` passes it down to `Sidebar` → `FlightPlanZone`, which computes leg data. `createFlightPlanLayer` computes draw geometry with the display projection too. The leg values therefore depend on the map component being loaded, and on its projection.

Tiles are not in git. They live in a host directory mounted read-only into the backend container (`packages/backend/DEPLOYMENT.md`), at `static/tiles/<theatre>/{z}/{x}/{y}.png`.

## Goals / Non-Goals

**Goals:**
- One source of truth per concern: the theatre file owns navigation, map files own display.
- Leg calculations stop depending on the map component, so a map switch cannot affect them, even transiently.
- The backend stays stateless: it learns the map from the request.

**Non-Goals:**
- A general-purpose catalogue API (search, metadata beyond names). Listing is enough.
- Caching or preloading tiles of non-selected maps.
- Refactoring `kneeboard.py` beyond threading a map id through it.

## Decisions

### D1 — Config layout: a directory per theatre

```
backend/theatres/
  germany/
    theatre.json        { "theatre_name": "Germany", "default_map": "default",
                          "navigation": { "mode": "projected",
                                          "projection": "transverse_mercator",
                                          "central_meridian": 21,
                                          "std_parallel1": ..., "std_parallel2": ... } }
    maps/
      default.json      { "map_name": "Standard", "projection": ..., "central_meridian": ...,
                          "origin_lat": ..., "zoom_info": [...], "bounds": {...}, ... }
static/tiles/germany/default/{z}/{x}/{y}.png
```

A map file keeps the current field names for everything display-related. `MapInfo` (frontend) and `MapInfo` (Pydantic, `kneeboard.py`) then only lose `navigation_mode` and the theatre name, and the tile/projection code keeps working unchanged. The navigation block uses the same projection field names as a map (`projection`, `central_meridian`, `std_parallel1/2`), so one projection builder serves both on each side.

*Alternatives.* One file per theatre with a `maps` array: fewer files, but the tool-generated tile grid (hundreds of lines per map) would be merged by hand into a shared file, and one map's change would show up as a change to the whole theatre. Rejected. A flat `maps/<theatre>__<map>.json`: rejected, it hides the hierarchy the change is about.

### D2 — HTTP surface

| Route | Returns |
|---|---|
| `GET /theatres` | `{ theatres: [ { id, name, default_map, maps: [ {id, name} ] } ] }` |
| `GET /theatres/{theatre}/theatre.json` | the theatre file (name, `default_map`, `navigation`) |
| `GET /theatres/{theatre}/maps/{map}.json` | the map file |
| `GET /tiles/{theatre}/{map}/{z}/{x}/{y}.png` | a tile |

The theatre file is deliberately not served at the old `/theatres/{theatre}.json`: that URL returned the flat config with a `Last-Modified` header, so browsers may hold it in their HTTP cache and would hand back a file with no `navigation` block (found while testing in the running app). The catalogue, theatre and map responses carry `Cache-Control: no-cache` so later config edits are revalidated.

`/theatres` becomes a full catalogue in one call. This replaces `useTheatres`' list-then-fetch-each pattern, and gives the frontend the map list and default without extra round trips. Theatre and map ids are validated against the catalogue before they are used to build file paths (no path traversal through `{map}`).

*Alternative.* Keep `/theatres/{id}.json` returning a merged theatre + default map. Rejected: it reproduces the conflation this change removes.

### D3 — Navigation settings are loaded independently of the map

A new frontend hook, `useTheatreNavigation(theatre)`, fetches `theatre.json` and builds the navigation projection (via `createMapProjection`) and mode. `PlannerApp` uses it to feed `Sidebar`/`FlightPlanZone` directly. `Map.tsx`'s `onMapNavInfoChange` is removed. `Map.tsx` also consumes the hook, for drawing (D4).

On the backend, `flight_plan.py`'s `_load_theatre_config` reads `theatre.json` and `_create_transformer` reads its `navigation` block. `FlightPlanData` keeps its signature: it still only needs the theatre.

*Alternative.* Keep publishing nav info from the map, but from a separate field. Rejected: leg values would still wait on (and re-run with) every map load.

### D4 — Drawing: geometry from navigation, placement from display

`createFlightPlanLayer` takes both projections. `calculateAllLegDrawData` and `generateArcPoints` run with the **navigation** projection and mode; they already output lat/lon (turn centre, straightening point, arc points). Every resulting lat/lon is then transformed into the **display** projection, as the layer already does. A leg's straight part becomes a two-point segment in display coordinates, which is straight by construction (spec: legs drawn as straight lines). Turn arcs stay densified at 30 points, so they follow the navigation geometry on any map.

Other layers (plan objects, threat rings, library ghosts, grid) only place lat/lon positions, and keep using the display projection.

The kneeboard needs no change for this. `kneeboard.py` already gets leg data from `FlightPlanData` (navigation, D3), and computes the page rotation from the endpoints projected into the map's pixel grid, so the drawn leg is vertical on any map.

### D5 — Map choice storage

The choice is a single local-storage key, `dcsplan.mapChoice`, holding `{ [theatreId]: mapId }`. It is read through a small module (`utils/mapChoice.ts`) that resolves `theatre → mapId` against the catalogue. An unknown or absent entry resolves to `default_map`, and the stale entry is left in place (harmless, and restored if the map comes back). The module notifies subscribers, so `LibraryMap` and `Map` follow changes made by the other (spec: same map on every view). Same-tab updates use an in-module subscription; other-tab sync is out of scope.

The key is device-scoped. It is not cleared on sign-in or sign-out and is not part of the local-data migration set (AD-8), because it is a display preference, not one of the three entities (AD-1).

### D6 — Map switch rebuilds the view, carrying centre and scale

`Map.tsx`'s map-building effect currently keys on `mapInfo`, which is fetched when `flightPlan.theatre` changes. It is re-keyed on `(theatre, mapId)`. Before tearing down, the current view is captured as a lat/lon centre plus a resolution in metres per pixel. After building, the centre is transformed into the new projection, and the new view is set to the resolution in its list closest to the captured one.

`mapViewState.ts` changes from `{center, zoom, theatre}` to `{ centerLonLat, metresPerPixel, theatre }`, so a view saved under one map restores correctly under another. Restoring a view saved under the same map gives the same view as today. `LibraryMap.tsx` gets the same treatment.

*Alternative.* Keep the OL map and swap only the view and tile layer. That is possible, but the effect already rebuilds everything on theatre change, and one rebuild path is simpler. Revisit only if switching feels slow.

### D7 — Kneeboard request carries the map

`GenerateDialog` sends the resolved map id as a `map` query parameter on `POST /kneeboard`, alongside `output` and `details`. It is a parameter, not part of the request body, because it describes rendering, not the plan. A missing value resolves to `default_map`. An id the theatre does not offer gives 400 before a task is queued. `_get_map_info(theatre, map)`, `_fetch_tile(theatre, map, …)` and `overview_map_page` thread the id through.

### D8 — Tile generator emits one map

`generate_tiles.py` takes a theatre id and a map id. It writes `tiles/<theatre>/<map>/` and merges the tile grid (`zoom_info`) into `maps/<map>.json`, creating the file if needed and keeping hand-entered fields. The georeference (projection, origin, NE reference corner, bounds) cannot be derived from the source image, so it stays hand-entered; the script lists the fields still missing. It never writes `theatre.json`, which is hand-maintained because it carries the navigation decision, and it refuses to run for a theatre that has none.

## Risks / Trade-offs

- **The navigation block is copied from the default map and could drift.** Someone regenerates the default map with a different projection and expects headings to follow. → The theatre file is the explicit owner. This is documented in `packages/tools/README.md`, and the generator never writes it.
- **The backend could compute different leg values after the split.** → Golden test: `FlightPlanData` on a fixture plan per theatre gives identical leg values before and after (spec: no regression in computed legs). The same check applies to `calculateAllLegData` on the frontend.
- **Old tile paths 404 after deploy.** → The tile move is a deploy step done with the release (Migration Plan). The frontend and backend ship together (single origin), so no client asks for old paths after the switch.
- **A map with much smaller bounds than its theatre** leaves waypoints over blank tiles. → Accepted (proposal non-goal).
- **Lambert conic maps** would display in the planner but fail kneeboard generation. → Accepted (proposal non-goal). A map file declaring an unsupported projection makes the backend kneeboard return a clear error.

## Migration Plan

1. Convert each `theatres/<id>.json` into `theatres/<id>/theatre.json` (name, `default_map: "default"`, `navigation` built from the old `navigation_mode` and projection fields) plus `theatres/<id>/maps/default.json` (the rest). This is done by a one-off script in `packages/tools/scripts/`, and the result is committed.
2. On the tile host, move `static/tiles/<id>/{z}` to `static/tiles/<id>/default/{z}` for each theatre (a `mkdir` and `mv` per theatre). Update `DEPLOYMENT.md` with the new layout.
3. Deploy backend and frontend together.

Rollback: redeploy the previous release and move the tiles back (the reverse `mv`). No database or user data is involved. Local-storage map choices left by the new version are ignored by the old one.
