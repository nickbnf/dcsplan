# Tasks

> Backend tests run with `pnpm test:backend` (`uv run pytest` in `packages/backend`). Frontend tests run with `pnpm --filter frontend exec vitest run`, and type-checking with `pnpm --filter frontend exec tsc --noEmit` (pnpm only, never npm). Do not `git commit`: the maintainer commits by hand. "D-n" refers to `design.md`.

## 1. Baseline: freeze today's leg values

- [x] 1.1 Before touching any config, capture golden leg values for a fixture plan on each of Caucasus, Syria and Germany: heading, distance, turn centre, straightening point, time and fuel per leg. Capture them from `FlightPlanData` (backend) and from `calculateAllLegData` / `calculateAllLegDrawData` (frontend), and store them as fixtures next to the existing leg-calc contract tests (`test_leg_calc_contract.py`, `legCalcContract.test.ts`). Verify: the new golden tests pass on the unchanged code.

## 2. Config layout and migration (D1, Migration Plan step 1)

- [x] 2.1 Write the one-off conversion script `packages/tools/scripts/split_theatre_config.py`. It turns each `backend/theatres/<id>.json` into `<id>/theatre.json` (`theatre_name`, `default_map: "default"`, a `navigation` block from `navigation_mode` and the projection fields) and `<id>/maps/default.json` (display fields plus `map_name`). Run it, commit-ready, and remove the old flat files. Verify: for each theatre, `navigation` + `maps/default.json` together contain every field of the old file except `navigation_mode`, which becomes `navigation.mode` (a check inside the script that fails loudly).
- [x] 2.2 Add a backend `theatres.py` catalogue module that loads the directory layout, lists theatres with their maps and default, and resolves `(theatre, map|None)` to a map config, with unknown ids raising a dedicated error. Verify with `test_theatres.py`:
  - all three theatres are listed with one `default` map each;
  - `None` resolves to the default map;
  - an unknown map raises;
  - ids containing `/` or `..` are rejected.

## 3. Backend navigation split (D3)

- [x] 3.1 Make `flight_plan.py`'s `_load_theatre_config` / `_create_transformer` read the theatre's `navigation` block through the catalogue. Verify: the group 1 backend golden tests and the existing `test_flight_plan*.py` / `test_straigthening_point.py` suites pass unchanged.

## 4. Backend routes and kneeboard (D2, D7)

- [x] 4.1 Replace `GET /theatres` with the catalogue response. Add `GET /theatres/{theatre}/maps/{map}.json` and change tiles to `GET /tiles/{theatre}/{map}/{z}/{x}/{y}.png`, all validated through the catalogue. Verify with route tests: the catalogue shape, a map file served, a tile served from the new path, and 404 for an unknown theatre or map.
- [x] 4.2 Thread the map id through `kneeboard.py` (`_get_map_info`, `_fetch_tile`, `_assemble_tiles`) and `overview_map_page.py`, and add the `map` query parameter to `POST /kneeboard`. Without it the default map is used; an unknown id returns 400 before a task is queued. Verify with `test_kneeboard.py` / `test_overview_map_page.py` updates: a request without `map` renders as before, and an unknown `map` returns 400 with no task created.
- [x] 4.3 Update `packages/backend/DEPLOYMENT.md`: new tile layout `tiles/<theatre>/<map>/`, and the one-time `mv` per theatre (Migration Plan step 2) with its reverse for rollback. Verify: the documented commands, run against a scratch copy of a tile tree, give the new layout.

## 5. Frontend catalogue and navigation (D2, D3)

- [x] 5.1 Rework `useTheatres` to read the single catalogue call (`id`, `name`, `default_map`, `maps`). Change `getTilesBaseUrl(theatre, map)` and add a map-info URL helper. Update `TheatreMetadata` users (`NewFlightPlanDialog`, `PlansHomePage`, etc.). Verify: `tsc --noEmit` is clean and the new-plan theatre picker still lists the three theatres.
- [x] 5.2 Add `useTheatreNavigation(theatre)`, which fetches `theatre.json` and returns the navigation projection and mode. Feed it from `PlannerApp` to `Sidebar` / `FlightPlanZone`, and remove `onMapNavInfoChange` from `Map.tsx`. Verify:
  - the frontend golden tests from 1.1 pass;
  - a component test shows leg data is computed with the navigation projection while the map is still loading.

## 6. Map choice (D5)

- [x] 6.1 Add `utils/mapChoice.ts`: a `dcsplan.mapChoice` local-storage record `{theatre: mapId}` with `get(theatre, catalogue)` resolving to the default when absent or unknown, `set`, and in-tab subscribe. Wrap storage access in try/catch. Verify with `mapChoice.test.ts`:
  - absent → default;
  - unknown stored id → default, and the stored entry is kept;
  - per-theatre isolation;
  - subscribers are notified on `set`;
  - storage throwing → default, no crash.

## 7. Map rendering and switching (D4, D6)

- [x] 7.1 Change `createFlightPlanLayer` to take the navigation projection and mode for `calculateAllLegDrawData` / `generateArcPoints`, and the display projection for placing lat/lon. Verify with a unit test: on a display projection different from the navigation one (e.g. EPSG:3857 vs a tmerc), turn points and arc lat/lon equal those computed with the navigation projection, and each leg's straight part is a two-point segment.
- [x] 7.2 Change `mapViewState.ts` to `{ centerLonLat, metresPerPixel, theatre }`, with a helper that picks the closest resolution in a list. Verify with a unit test: the closest-resolution pick, including when the scale is outside the new map's zoom range (clamped to the nearest end).
- [x] 7.3 Make `Map.tsx` load map info by `(theatre, selected map)` and rebuild on either change. Before teardown, capture centre and scale; after the rebuild, restore them via 7.2. Verify in the running app (`run` skill), with a temporary second Germany map built from `germany_test.json`:
  - switching keeps the same place centred and a similar scale;
  - leg headings in the sidebar do not change.
- [x] 7.4 Apply the same map selection, rebuild and view carry-over to `LibraryMap.tsx`. Verify in the running app: after choosing a map in the planner, the Library page shows that map for the same theatre.

## 8. Map selector and kneeboard request (spec: selector, kneeboard)

- [x] 8.1 Add a map selector to `map/DisplayControls.tsx` listing the theatre's maps and marking the selected one. Hide it when the theatre has one map; selecting a map calls `mapChoice.set`. Verify with a component test: hidden with one map, lists both with two, and selecting updates `mapChoice`.
- [x] 8.2 Make `GenerateDialog` send the resolved map id as `?map=` on `POST /kneeboard`. Verify with a test on the request URL, and in the running app: a kneeboard generated on the temporary second map shows its imagery with the same printed headings as on the default map.

## 9. Tools and docs (D8)

- [x] 9.1 Make `generate_tiles.py` take `--theatre` and `--map`, writing `backend/theatres/<theatre>/maps/<map>.json` and `tiles/<theatre>/<map>/`, and never `theatre.json`. Update `packages/tools/README.md` to describe the theatre → map layout and that `theatre.json`'s `navigation` block is hand-maintained. Verify: running the generator on a small source image produces a map file that the backend catalogue loads.

## 10. Integration check

- [x] 10.1 Run the full suites (`pnpm test:backend`, `pnpm --filter frontend exec vitest run`, `tsc --noEmit`) and confirm all are green. Then remove the temporary second map used in 7.3 and 8.2, unless the maintainer wants to keep it.

## Workflow follow-up

- Run `/opsx:verify` against the spec, then `/opsx:archive` once the maintainer has committed.
