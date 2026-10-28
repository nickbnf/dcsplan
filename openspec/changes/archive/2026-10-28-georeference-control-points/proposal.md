# Proposal

## Why

Each map's tiles are aligned with geographic coordinates from two hand-entered lat/lon corners (`origin_lat/lon`, `ref_corner_ne_lat/lon`). The resolution is the projected distance between them divided by the image width. Nothing checks that the NE corner lies on the origin's grid row, that the vertical scale matches, or that the projection fits the image, so errors go unnoticed. Germany default's corners are 0.008° (about 900 m, 28 px) off a common grid row. The model cannot represent that offset, so the map is slightly rotated against the overlay. Corner values rounded to three decimals also add up to about 13 px of offset at maximum zoom. Each map also builds its projection separately in the frontend and the backend from `projection` + `central_meridian`, and the backend cannot render Lambert conformal conic (LCC) maps although the frontend can.

## What Changes

- **BREAKING** (map config format): a map's georeference becomes:
  - `crs`: a full proj string, shared verbatim by frontend and backend
  - `origin_x`, `origin_y`: projected metres of the outer corner of the top-left pixel at native zoom
  - `resolution`: metres per pixel at native zoom, one value for both axes

  These replace `projection`, `central_meridian`, `std_parallel1/2`, `origin_lat/lon` and `ref_corner_ne_lat/lon` in `theatres/<theatre>/maps/<map>.json`. `theatre.json` and its `navigation` block are untouched.
- A map config records `control_points`: pixel position at native zoom, latitude and longitude, and an optional label. These are the source the georeference is fitted from, and they stay in the config as a record of where the values came from. Every shipped map carries at least three, not all on one line.
- A map config records its native image size (`image_width_px`, `image_height_px`), written by `generate_tiles.py`, so each zoom level's resolution can be derived exactly.
- New tool `packages/tools/scripts/georeference.py`:
  - fits `origin_x`, `origin_y` and `resolution` from a map's `crs` and `control_points` by least squares
  - reports the residual of each point, the RMS, and how much better a diagnostic fit allowing rotation and separate x/y scales would do
  - writes the fitted values back into the map config, keeping every other field

  Fitting happens only at preparation time, never in the service.
- `generate_tiles.py` keeps writing only `zoom_info` and lists the new georeference fields when they are missing. Tiling and georeferencing stay independent: re-tiling does not require a refit, and a refit does not require re-tiling.
- Run time (planner map, Library map, kneeboard leg and overview pages) uses the stored values directly:
  - **Projection:** built from `crs`. The backend can then render any CRS proj supports, LCC included.
  - **Per-zoom resolution:** `resolution × native width / width_px`.
  - **Grid origin:** `origin_x/y`.
- `bounds` is removed from the map config. The map views compute the image extent, its centre and the lat/lon range of the grid overlay from the georeference (image edges projected back to lat/lon).
- New backend configuration test: every shipped map must place each of its control points within its alignment tolerance (2 px at native zoom unless the map sets a larger one, for imagery drawn from real-world data while control points are DCS positions) of its stored pixel position.
- Migration:
  - Caucasus, Syria and Germany default are converted to the new format with values that reproduce today's rendering exactly.
  - Control points are then added and fitted for each. This deliberately corrects Germany default's residual misalignment.
  - The work-in-progress Germany VFR map is not migrated and leaves the catalogue until it is georeferenced.

## Capabilities

### New Capabilities
- `map-georeference`: how a map's tile image is tied to the earth. It covers:
  - the projected georeference contract (CRS, origin, resolution) and its use by every map view and the kneeboard
  - control points as the source of the georeference
  - the preparation-time fitting tool and its residual report
  - the alignment accuracy check every configured map must pass

### Modified Capabilities
- None. `theatre-maps` requirements (theatre → map hierarchy, map choice, navigation independence) are unchanged. Navigation settings in `theatre.json` keep their current format and values.

## Non-goals

- **Navigation settings:** `theatre.json` `navigation` is unchanged. Headings, distances and turn geometry stay identical (per `theatre-maps`, "Navigation is independent of the displayed map").
- **Rotated or non-square-pixel imagery:** such images are not modelled at run time. The diagnostic fit only reports them. Images that do not fit a north-up raster in some CRS are warped once into one before tiling (e.g. with `gdalwarp`). Building that warping step into the tooling is out of scope.
- **Run-time fitting:** the service never fits or validates control points at startup.
- **Germany VFR map:** it stays a work in progress and is not migrated, fitted or shipped by this change. Its config is taken out of `theatres/germany/maps/` until it is georeferenced, since every map in the catalogue must pass the configuration check.
- **Interactive control-point picking UI:** points are entered in the map config by hand (pixel and lat/lon read from an image viewer and a reference source).
- **Ownership and versioning model:** maps remain static application configuration. Spaces, snapshots and versioning (AD-1, AD-3, AD-5) do not apply.

## Impact

- **Map configs:** `packages/backend/theatres/*/maps/*.json` (format change and migration).
- **Backend:**
  - `kneeboard.py`: `MapInfo`, `_transformer_for_projection`, `_get_resolution_for_zoom`, `_bbox_tm_to_tile_bounds`, the leg-page pixel conversions
  - `overview_map_page.py`
  - `theatres.py` and the map-info route in `main.py`
  - kneeboard tests. The leg-value goldens in `test_theatre_golden.py` come from navigation settings and do not change.
- **Frontend:**
  - `utils/tileLayer.ts` (`MapInfo`, `calculateResolutions`, `createTileGrid`)
  - `utils/projectionUtils.ts` (projection built from `crs` instead of per-type branches)
  - `Map.tsx`, `LibraryMap.tsx` and related tests
  - `hooks/useTheatreNavigation.ts`, to check it reads only navigation settings, not map fields
- **Tools:** new `packages/tools/scripts/georeference.py`; `generate_tiles.py` (`MAP_GEOREFERENCE_FIELDS`); `packages/tools/scripts/README.md`.
- **Dependencies:**
  - pyproj added to the tools' `requirements.txt` (already a backend dependency)
  - numpy for the least-squares fit, already a backend and tools dependency
  - no new frontend dependency: proj4 is already used
