# Tasks

## 1. Shared georeference module (backend)

- [x] 1.1 Create `packages/backend/map_georeference.py` with `transformer_for_crs(crs)` (WGS84 → CRS, `always_xy=True`) and `project_control_points(map_cfg)`. Verify with a unit test that projecting a known point with a tmerc and an LCC proj string matches pyproj called directly.
- [x] 1.2 Add `residuals_px(map_cfg)`: each control point's predicted pixel position from `origin_x/y` + `resolution` (corner-edge convention, design D1) and its error in native pixels. Verify with a unit test on a synthetic map (points generated from a known georeference give 0 error; shifting `origin_x` by 3 × resolution gives 3 px on every point).
- [x] 1.3 Add `fit(map_cfg)`, the least-squares solve for `origin_x`, `origin_y`, `resolution` (design D3), with precondition errors for fewer than three points or collinear pixel positions. Verify with unit tests: exact recovery on synthetic points, recovery within 0.1 px with ±0.5 px noise, and an error raised for 2 points and for 3 collinear points.
- [x] 1.4 Add `affine_diagnostic(map_cfg)`, which returns the RMS of the 3-parameter and 6-parameter fits plus the implied rotation and x/y scale ratio. Verify with a unit test: synthetic points rotated by 2.5° report about 2.5° and an RMS drop, unrotated points report about 0° and a ratio of about 1.
- [x] 1.5 Add `derive_bounds(map_cfg)`, sampling the image outline (corners plus 64 points per edge) and inverse-projecting it (design D3). Verify with a unit test on a tmerc map straddling its central meridian: the derived `maxLat` is taken mid-edge, not at a corner, and every sampled outline point lies inside the result. (Superseded by 5.5: bounds moved to the frontend and `derive_bounds` was removed.)

## 2. Preparation tooling

- [x] 2.1 Add `pyproj` to `packages/tools/scripts/requirements.txt`. Verify that `import pyproj` works in the tools environment.
- [x] 2.2 Write `packages/tools/scripts/georeference.py` (`--theatre`, `--map`, `--dry-run`, `--tolerance`, `--force`) as a thin CLI over `map_georeference`. It prints each point's label and error, the RMS and the affine diagnostic, and writes back `origin_x`, `origin_y` and `resolution` (`bounds` until 5.5) with 4-space indent, keeping all other keys and their order. Verify on a scratch copy of a map config with synthetic control points:
  - `--dry-run` leaves the file byte-identical
  - an out-of-tolerance fit exits non-zero without writing
  - `--force` writes it anyway
  - a normal run changes only the four keys
- [x] 2.3 Update `generate_tiles.py` so it writes `image_width_px` / `image_height_px` next to `zoom_info`, and set `MAP_GEOREFERENCE_FIELDS` to `crs`, `origin_x`, `origin_y`, `resolution` and `control_points`. Verify by running it with `--theatre`/`--map` on a small test image into a scratch theatres dir: the image size is written, the missing fields are listed, and an existing georeference and control points are untouched.
- [x] 2.4 Document the workflow (tile → enter control points → fit → check) in `packages/tools/scripts/README.md`. Cover the map config fields, the `crs` proj-string rule (no `EPSG:` codes), the pixel convention ((0.5, 0.5) is the centre of the top-left pixel), how to read the residual report, and the `gdalwarp` route for images that do not fit any CRS. Verify that the documented commands run as written against the scratch config from 2.2.

## 3. Map config conversion (no visual change)

- [x] 3.1 Write a one-off conversion script in the scratchpad (not shipped) that adds `crs`, `origin_x`, `origin_y`, `resolution`, `image_width_px` and `image_height_px` to each shipped map, with values that reproduce today's grid (design D7 step 1). Keep the legacy fields for now. Run it on caucasus/default, syria/default and germany/default. Verify per map that origin and per-zoom resolutions computed from the new fields equal the legacy ones to within 1e-6 m and 1e-9 m/px.
- [x] 3.2 Take `germany/maps/vfr.json` out of the catalogue: move it next to the VFR source in `packages/tools/scripts/` (now `packages/tools/scripts/vfr.json`). Verify that `/theatres` lists Germany with only its default map, and that the frontend map selector is hidden for Germany.

## 4. Backend run time on the new georeference

- [x] 4.1 Update `MapInfo` in `kneeboard.py` with the new required fields (`crs`, `origin_x`, `origin_y`, `resolution`, `image_width_px`, `image_height_px`, optional `control_points`) and drop the legacy ones from the model. Verify that a config missing `crs` fails validation with the field named.
- [x] 4.2 Replace `_transformer_for_projection` with `map_georeference.transformer_for_crs(map_info.crs)`. Make `_get_resolution_for_zoom` return `resolution × image_width_px / width_px`. Use `origin_x/y` directly in `_bbox_tm_to_tile_bounds`, the leg-page pixel conversions and `overview_map_page.py`. Verify with the existing kneeboard tests (`test_kneeboard.py` and related), updated only where fixtures construct `MapInfo`. Rendered output for converted maps must be unchanged: compare a generated kneeboard PDF/PNG for each theatre before and after.
- [x] 4.3 Add a kneeboard test with an LCC map fixture (small synthetic tile set or blank tiles) to verify generation succeeds and places a waypoint at the expected pixel (spec: Lambert conformal conic map on the kneeboard).
- [x] 4.4 Update the `theatres.py` module docstring and the `get_map_info` route docstring in `main.py` to describe the new map fields. Verify by reading.

## 5. Frontend run time on the new georeference

- [x] 5.1 Add `createProjectionFromCrs(code, crs)` to `projectionUtils.ts`, registering the proj string under `map:<theatre>/<map>` and keeping the current extent. Keep `createMapProjection` for navigation only. Verify with a Vitest test that a tmerc, an LCC and the full Web Mercator string each produce a projection that transforms a known point to the pyproj value (hard-coded in the test).
- [x] 5.2 Update `MapInfo`, `calculateResolutions` and `createTileGrid` in `tileLayer.ts` to use `origin_x/y`, `resolution`, `image_width_px` and `width_px`. Verify with a Vitest test that resolutions and origin for each converted shipped map equal the values computed with the legacy formula (fixture values from task 3.1).
- [x] 5.3 Switch `Map.tsx` and `LibraryMap.tsx` to `createProjectionFromCrs` and the new `MapInfo`. Update `flightPlanLayer.test.ts` and other tests that build `MapInfo` fixtures. Verify that `pnpm --filter frontend test` passes and that `useTheatreNavigation.ts` still reads only `theatre.json` navigation settings.
- [x] 5.4 Check whether `CONFIG_CACHE_HEADERS` can let a browser keep an old-format map config across a deploy (design, Risks), and shorten them for this release if so. Verify by inspecting the headers on `/theatres/{theatre}/maps/{map}.json`.
- [x] 5.5 Remove `bounds` from the map configs (design D2). Add `imageExtent` and `imageGeographicBounds` to `tileLayer.ts` and use them in `Map.tsx` and `LibraryMap.tsx` for the projection extent, the initial centre and the grid overlay; remove `transformBoundsToTransverseMercator` and `calculateTransverseMercatorCenter`. Drop `bounds` from `MapInfo` (backend and frontend), `georeference.py` (which removes a leftover one), `generate_tiles.py` and `derive_bounds` from `map_georeference.py`. Verify with Vitest that the computed bounds match pyproj's (former `derive_bounds` values) for a tmerc and an LCC map, and take the extreme latitude mid-edge.

## 6. Remove the legacy georeference fields

- [x] 6.1 Delete `projection`, `central_meridian`, `std_parallel1/2`, `origin_lat/lon` and `ref_corner_ne_lat/lon` from every shipped map config. Verify that `grep -rn "ref_corner_ne\|origin_lat\|origin_lon" packages --include='*.py' --include='*.ts' --include='*.tsx' --include='*.json' --include='*.md'` (excluding `node_modules`/`.venv`) returns nothing, and that backend and frontend tests pass.
- [x] 6.2 Update `docs/` and `openspec/specs/theatre-maps` references that describe maps by `projection`/`central_meridian`, if any. Verify with the grep from 6.1 extended to `docs/` and `openspec/specs/`.

## 7. Control points and refit

- [x] 7.1 (Maintainer) Enter 8–15 control points spread over the image for caucasus/default, recording pixel positions in the corner-edge convention and lat/lon from a reference source. Run `georeference.py --dry-run` and confirm every residual is within the map's alignment tolerance (2 px unless the map sets `alignment_tolerance_px`). Fix or drop outliers, and revisit the CRS if the affine diagnostic shows a rotation or scale ratio. Then run without `--dry-run`. Verify the report and the updated config.
  - Done with 4 control points and `alignment_tolerance_px: 4`: RMS 2.0 px, max 3.2 px (Vody lake), rotation +0.004°. Each point is within 1.4–4.6 px (≤ 90 m) of the fit from the other three. The refit moves the origin by −0.8/−4.4 px.
- [x] 7.2 (Maintainer) Same as 7.1 for syria/default.
  - Done with 4 control points and `alignment_tolerance_px: 6`: RMS 3.9 px, max 5.4 px (Adana lake), rotation +0.03°. Each point is within 2.1–7.3 px (≤ 410 m) of the fit from the other three: real-world imagery against DCS terrain, as for Germany. The refit moves the origin by −0.3/−2.2 px.
- [x] 7.3 (Maintainer) Same as 7.1 for germany/default. Its image is drawn from real-world data and DCS terrain differs locally, so set `alignment_tolerance_px` to what its points achieve (design D1). Verify that the reported shift from the converted values removes the about −0.039° tilt: a feature near the east edge moves by up to about 28 px at max zoom.
  - Done with 9 DCS control points and `alignment_tolerance_px: 16`: RMS 9.5 px, max 15.7 px (Konz), rotation +0.02°. The image is real-world, and its points disagree with DCS by 3–16 px in varying directions. Potsdam was dropped: two separate features there are about 30 px (1 km) east–west from the fit, a local DCS difference.
  - The expected 28 px tilt correction did not show up: against DCS positions, the converted values were already within a few pixels (refit moves the origin by −3.8/+3.1 px and the scale by +7 px across the image).
- [x] 7.4 Visually check each refitted map in the planner and on a generated kneeboard: waypoints placed on 3–4 control-point features sit on the feature at max zoom. Record any remaining offset in the PR description.
  - Checked by the maintainer in the planner on all three maps. Expected offsets for the PR description: Caucasus up to about 60 m, Syria up to about 300 m, Germany up to about 500 m, and about 1 km around Potsdam (a local DCS terrain difference).

## 8. Configuration check and parity fixture

- [x] 8.1 Add `packages/backend/test_map_georeference.py`, parametrised over every catalogue map (design D5). It checks required fields, that `crs` parses, at least three non-collinear control points, every residual within the map's alignment tolerance, and no stored `bounds`. Verify it passes on all shipped maps, and fails with the map, label and error named when `origin_x` of a scratch copy is nudged by 3 × resolution.
  - Passes on all three shipped maps and on the hand-edit case.
- [x] 8.2 Generate `packages/shared/map-georeference/projected-control-points.json` from the backend test under `UPDATE_GOLDEN=1` (design D6), and add a Vitest test that projects every control point with proj4js and asserts agreement within 0.01 m. Verify that both tests pass.
  - `test_map_georeference.py` writes the fixture and also fails when it is out of date; `mapGeoreferenceParity.test.ts` checks it. Regenerate after adding the Caucasus and Syria points.

## 9. Integration

- [x] 9.1 Run the full backend (`pytest` in the project venv) and frontend (`pnpm --filter frontend test`) suites. Verify that both pass, including the unchanged `test_theatre_golden.py` leg-value goldens.
  - Backend 495 passed, 7 skipped (including the unchanged leg-value goldens); frontend 798 passed; `tsc` clean.
- [x] 9.2 Generate a kneeboard for the golden fixture plan on each theatre and compare headings, distances and figures with the pre-change output. Verify they are identical (spec `theatre-maps`: navigation independent of the displayed map); only imagery alignment may differ.
  - Rendered all leg and overview pages of the golden plans and compared them with the pre-change renders: headings, distances, times, speeds and altitudes are identical, and only the imagery under them moves by 1–2 px (more changed pixels on Germany's busy chart).
- [x] 9.3 Run `openspec validate georeference-control-points --strict`. Verify that it reports the change as valid.

## Workflow follow-up

- Re-introduce the Germany VFR map with an LCC `crs` and control points through `georeference.py` once it is ready.
- Archive the change after review and sync `map-georeference` into `openspec/specs/`.
