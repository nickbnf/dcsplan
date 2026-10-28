# Design

## Context

See proposal.md (Why) for the problem and specs/map-georeference/spec.md for the required behaviour.

Current state relevant to the approach:

- Map configs live in `packages/backend/theatres/<theatre>/maps/<map>.json`. `main.py` serves them to the frontend unchanged (`FileResponse`), so the file format is also the wire format.
- **Map projection.** It is rebuilt from `projection` + `central_meridian` (+ `std_parallel1/2`) in two places:
  - Backend: `kneeboard.py:_transformer_for_projection`, which supports tmerc and EPSG:3857 only.
  - Frontend: `projectionUtils.ts:createMapProjection`, which supports tmerc, EPSG:3857 and LCC.
- **Navigation projection.** `theatre.json` `navigation` uses the same `projection` / `central_meridian` vocabulary. It is read by `flight_plan.py` and `useTheatreNavigation.ts` through the same `createMapProjection` helper. Navigation is out of scope (proposal, Non-goals).
- **Tile grid.** Both sides compute it identically:
  - origin: the projected `origin_lat/lon`
  - resolution: the Euclidean distance to the projected `ref_corner_ne` divided by `width_px` at each zoom
- **Tile pyramid.** `generate_tiles.py` resizes the native image to `floor(W / 2^k) × floor(H / 2^k)` per level. Each level covers the whole image extent, so its true horizontal resolution is `native_res × W / width_px`.
- All three shipped maps generate their native zoom as their maximum zoom, so `W`, `H` = the largest zoom's `width_px`, `height_px`.
- Both PROJ (pyproj) and proj4js implement `+proj=tmerc` with the exact Poder/Engsager algorithm (proj4js aliases `tmerc` to `etmerc`), so frontend and backend agree on the projection maths far beyond pixel precision.

## Goals / Non-Goals

**Goals:**
- One georeference representation, read identically by the planner map, the Library map and the kneeboard compositor.
- The fit and its validation live in tooling and tests; the run-time code only reads numbers.
- A conversion step that reproduces today's rendering exactly, so the later refit is the only visible change and can be judged on its own.

**Non-Goals:**
- Migrating `theatre.json` navigation settings to a CRS string. The asymmetry is accepted for now: maps get a `crs` string, while navigation keeps `projection` / `central_meridian`.
- Weighted fits, outlier rejection or automatic control-point detection. The maintainer removes bad points by hand based on the residual report.
- Supporting rotation or non-square pixels at run time. OpenLayers' `TileGrid` cannot represent either.

## Decisions

### D1. Map config fields

```jsonc
{
  "map_name": "Default",
  "crs": "+proj=tmerc +lat_0=0 +lon_0=21 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs",
  "origin_x": -1450123.4,          // projected metres, outer top-left corner of the image
  "origin_y": 6170456.7,
  "resolution": 32.0183,           // projected metres per native pixel, both axes
  "image_width_px": 40960,         // native image size (written by generate_tiles.py)
  "image_height_px": 32768,
  "control_points": [
    { "label": "EDDF ARP", "px": 23011.5, "py": 21877.0, "lat": 50.0333, "lon": 8.5706 }
  ],
  "alignment_tolerance_px": 12,    // optional, default 2 (see below)
  "zoom_info": [ ... ]             // unchanged
}
```

Removed: `projection`, `central_meridian`, `std_parallel1`, `std_parallel2`, `origin_lat`, `origin_lon`, `ref_corner_ne_lat`, `ref_corner_ne_lon`, and `bounds`, which is computed from the georeference (D2).

- **`crs` is always a proj string, never an `EPSG:` code.** proj4js needs no definition lookup, and PROJ and proj4js receive byte-identical input. Caucasus's Web Mercator is written out in full: `+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs`.
- **Pixel coordinates use the corner-edge convention.** `(0, 0)` is the top-left corner of the image, and the centre of pixel column `c` is at `c + 0.5`. This matches how the tile grid origin is defined, so there is no hidden half-pixel term.
- **The alignment tolerance is per map, 2 px by default.** Control points are DCS positions, since plan coordinates are used in DCS. An image captured from DCS can match them to a pixel or two. An image drawn from real-world data cannot: DCS terrain differs locally from reality, by 100–350 m between landmarks on the Germany map, in directions that vary from place to place, so no georeference removes it. Such a map sets `alignment_tolerance_px` to what its points actually achieve, and the residual report still shows each point. The alternative of warping the image onto DCS positions (thin-plate spline, many more points, re-tiling) stays open if the leftover offset proves noticeable.
- **The image size is stored explicitly** rather than inferred from `zoom_info`. Tiles may legitimately be generated without the native level (`--zoom-levels`), in which case the largest `width_px` would not be the native width.

*Alternatives considered:*
- Keeping `origin_lat/lon` and adding only `resolution`: still has rounding and a degrees round trip, and nothing to validate against.
- A GDAL world file next to the image: a second file to keep in sync, and the frontend never sees it.

### D2. Run-time use

- **Projection.**
  - Frontend: a new `createProjectionFromCrs(code, crs)` registers `crs` under the code `map:<theatre>/<map>` and returns the OpenLayers projection. The current `setExtent([-2e7, -2e7, 2e7, 2e7])` is kept.
  - Backend: `Transformer.from_crs("EPSG:4326", map_info.crs, always_xy=True)`.
  - `createMapProjection` stays, for navigation only.
- **Tile grid.** Origin `[origin_x, origin_y]`. Resolution at zoom `z` is `resolution × image_width_px / width_px(z)`. This formula is the same in `tileLayer.ts:calculateResolutions` and `kneeboard.py:_get_resolution_for_zoom`, and the pixel conversions in `kneeboard.py` / `overview_map_page.py` keep their current shape.
- **Pydantic `MapInfo`** gains the new fields and drops the old ones. A map missing them fails validation when it is loaded, so a request for that map returns an error instead of drawing a wrong map. The configuration test (D5) catches the same thing before deployment.
- **Extent, centre and lat/lon grid range.** The frontend computes them from the georeference instead of reading stored bounds (`tileLayer.ts`): the extent is the image's outer edges, `[origin_x, origin_y − resolution × image_height_px, origin_x + resolution × image_width_px, origin_y]`, and the centre is its middle. The lat/lon range for the grid overlay comes from sampling the image outline (corners plus 64 points per edge) and inverse-projecting it. Sampling the edges matters: in tmerc and LCC an image edge is not a parallel or meridian, and the extreme latitude can sit mid-edge. Stored bounds were redundant with the georeference and could go stale after a hand edit; the previous two-corner projection of a lat/lon box only approximated the image extent.
- **The map-info route** keeps serving the file as-is. `control_points` reach the frontend, which ignores them; they are small and not sensitive.

*Alternative considered:* having the backend serve a reduced "runtime" view of the map config. Rejected: it adds a transform layer for no benefit.

### D3. Fitting tool, `packages/tools/scripts/georeference.py`

```
georeference.py --theatre germany --map default [--dry-run] [--tolerance 2.0] [--force]
```

**Model.** For each control point `i`, with projected `(X_i, Y_i)` from `crs`:

```
X_i = origin_x + resolution · px_i
Y_i = origin_y − resolution · py_i
```

This is linear in `(origin_x, origin_y, resolution)`. The fit stacks the `2N` equations and solves them with `numpy.linalg.lstsq`. The residuals are converted back to native pixels as `(predicted − recorded)` using the fitted resolution.

**Preconditions.** At least three points, and the pixel positions must not be collinear (the smallest singular value of the centred pixel matrix must be above a small threshold). Otherwise the tool exits non-zero without writing.

**Diagnostic fit.** The same points are also fitted with a full 6-parameter affine. The tool reports:
- the RMS of each fit
- the affine's rotation (`atan2` of its shear/rotation terms)
- the affine's x/y scale ratio

A large RMS drop with a non-trivial rotation or scale ratio is the signature of a wrong CRS or a non-north-up image (spec: "Image does not fit the declared CRS").

**Write-back.**
- The tool reads the JSON, replaces `origin_x`, `origin_y` and `resolution` (and drops a leftover `bounds`), and writes it back with the same 4-space indent `generate_tiles.py` uses, one control point per line, keeping key order.
- It refuses to write when the largest residual exceeds the tolerance unless `--force` is given. The tolerance is `--tolerance` if given, else the map's `alignment_tolerance_px`, else 2 px. `--dry-run` never writes.
- Numbers are written rounded to 0.001 m (origin) and 1e-6 m/px (resolution). That is far below a pixel and keeps diffs readable.

*Alternatives considered:*
- Fitting inside `generate_tiles.py`: couples a seconds-long refit to a minutes-long tiling run (proposal, What Changes).
- Fitting at service start: needs human judgement on the residuals, and would have to be duplicated in the frontend.

### D4. `generate_tiles.py` changes

- Write `image_width_px` / `image_height_px` alongside `zoom_info`.
- Update `MAP_GEOREFERENCE_FIELDS` to `crs`, `origin_x`, `origin_y`, `resolution` and `control_points`, so the "still to fill in" message lists the new fields.
- Nothing else changes; it never touches the georeference.

### D5. Configuration check, `packages/backend/test_map_georeference.py`

This is a pytest test, parametrised over every `(theatre, map)` in the catalogue (`theatres.theatre_ids()` / `map_ids()`), so a new map is covered automatically. For each map it checks:

1. The required fields are present and `crs` parses with pyproj.
2. There are at least three control points, and they are not collinear.
3. Every control point projects to within the map's alignment tolerance (D1) of its recorded position. A failure message names the map, the label and the error. This also catches hand edits to the origin or resolution that were not followed by a refit.

The fit and the residual computation live in a small shared module in the backend (`map_georeference.py`), which the tool imports via its existing `BACKEND_DIR` path. That way the tool and the test can never disagree on a formula, and the fit is unit-tested with the backend's pytest setup (tools have no test harness). The module uses pyproj and numpy, both already backend dependencies. `georeference.py` is a thin CLI around it: argument parsing, the report and the JSON write-back. The tools' `requirements.txt` gains `pyproj`.

### D6. Frontend/backend projection parity

A shared fixture, `packages/shared/map-georeference/projected-control-points.json`, holds, for every shipped map, each control point's projected `(X, Y)` as computed by pyproj. The backend test writes it under `UPDATE_GOLDEN=1`, the same convention as `test_theatre_golden.py`. A Vitest test projects the same points with proj4js using the map's `crs` and asserts agreement within 0.01 m. This guards the claim that both libraries implement each CRS identically, which matters most for LCC and for points far from the central meridian.

### D7. Migration in two steps

1. **Conversion, no visual change.** A one-off script, kept in the change's scratch area and not shipped, produces the new fields for each shipped map:
   - `crs` from `projection` / `central_meridian`, as built today
   - `origin_x/y` = the old projected origin
   - `resolution` = old Euclidean distance / native `width_px`
   - `image_width/height_px` = the native zoom's `width_px` / `height_px`

   With these values the tile grid equals today's for every map: same origin, same resolutions. This is checked by comparing the computed resolution arrays and origins before and after.
2. **Refit.** Enter at least three, preferably 8–15, control points per map and run `georeference.py`. Caucasus and Syria should move by a few pixels at most (only the corner rounding is removed). Germany default is expected to lose its about −0.039° tilt.

   If a map's residuals do not come under tolerance with its current CRS, the residual report shows it, and choosing the right CRS becomes part of that map's task. Step 1's output stays committed until then, but the configuration check would fail. So step 2 must complete for every shipped map before the change is done.

The Germany VFR config leaves `theatres/germany/maps/` (the maintainer keeps it outside the catalogue) until it gets an LCC `crs` and control points through the same tool.

## Risks / Trade-offs

- **[Control points are read by hand and may be wrong]** → The residual report names each point's error, and points to drop or re-measure stand out. With 8 or more points, a single bad point is clearly visible.
- **[Two tools now edit the same JSON file]** → Each tool replaces only its own keys and keeps every other key and the key order. The configuration test catches a georeference left inconsistent by either tool.
- **[Breaking config format: a stale frontend build against a new backend, or the reverse]** → Frontend and backend are deployed together from the monorepo, and map JSON is served with `CONFIG_CACHE_HEADERS`. Check during implementation that those headers do not let a browser hold an old-format map config across a deploy; shorten them for this release if they do.
- **[A single resolution assumes square pixels in the CRS]** → This is intended, because OpenLayers cannot do otherwise. The diagnostic fit tells the maintainer when the image violates it, and the remedy is warping the source once before tiling (proposal, Non-goals).
- **[Lower zoom levels round width and height down independently]** → Vertical scale at low zooms differs from horizontal by less than one level pixel. This is already the case today and is accepted.
- **[The navigation and map projection definitions now use two vocabularies]** → They are documented side by side in `packages/tools/scripts/README.md`. Unifying them is possible later without touching map configs.

## Migration Plan

1. Land the code and the converted configs together. There is no dual-read path for the old format.
2. Run conversion step 1 and verify the before/after tile grid equality.
3. Collect control points and refit each shipped map (step 2). Then regenerate the parity fixture (D6).
4. Run the backend and frontend tests; the configuration check must pass for every map.
5. Rollback: revert the change as a whole. Code and configs move together, and tiles are unaffected, because neither step re-tiles.

## Open Questions

- The default tolerance may be tightened from 2 px once real residuals of DCS-captured maps are known; maps drawn from real-world data set their own (D1).
