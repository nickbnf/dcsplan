# Tasks

> Backend tests run under the project venv (`packages/backend/venv`). Frontend
> tests run with `pnpm --filter frontend exec vitest run` (`test` starts watch mode), and type-checking with
> `pnpm --filter frontend exec tsc --noEmit` (pnpm only, never npm). Do not
> `git commit`: the maintainer commits by hand. "D-n" refers to `design.md`.

## 1. Plan creation with initial content (design D1)

- [x] 1.1 In `plans.py`, let plan creation take an optional initial Yjs update and store it as the plan's first `plan_updates` row, in the same transaction as the `plans` row.

  Verify with unit tests in `test_plans.py`:
  - a plan created with an update holds exactly one update row;
  - a plan created without one holds none, as before;
  - a failed insert (duplicate id) leaves no update row behind.
- [x] 1.2 In `space_routes.py`, add the optional `initialState` (base64) to `CreatePlanRequest` and pass it through. Reject invalid base64 with 422, and an oversized body with the existing limit.

  Verify with route tests in `test_space_routes.py`:
  - 201 with and without `initialState`;
  - 422 on bad base64;
  - 409 on a duplicate id, still unchanged.
- [x] 1.3 Check that content created through `initialState` reaches a client over the sync socket.

  Verify with a test in `test_sync_integration.py`: create a plan with a `pycrdt` doc's update, connect, and assert that the received doc holds the seeded content.
- [x] 1.4 Add `createPlan({ id, name, theatre, initialState? })` to `api/planApi.ts`.

  Verify in `planApi.test.ts` that the request body carries base64 `initialState` when one is given, and omits it otherwise.

## 2. Local-data helpers (design D5, D6)

- [x] 2.1 Add `isFreshPlan(plan)` to `utils/flightPlanUtils.ts`. It compares against `newFlightPlan()`, ignoring `theatre`: no points, refs, markers or attack planning, default parameters, default name.

  Verify with unit tests: a fresh plan on any theatre is fresh; one waypoint, one marker, one ref, a renamed plan, or a changed parameter each make it not fresh.
- [x] 2.2 Add `isDefaultAircraft(aircraft)` to `utils/performanceStorage.ts`.

  Verify with unit tests: `defaultAircraft()` is default; a model, a regime, or a taxi fuel value each make it not default.
- [x] 2.3 Add to `utils/libraryStorage.ts`:
  - `listLocalLibraries()`, which scans the `dcsplan.library.*` keys and returns the non-empty ones by theatre;
  - `removeLocalEntries(theatre, uuids)`, which clears the key once it is empty.

  Verify with unit tests over a seeded localStorage: other keys are ignored, removal is partial, and an emptied key is removed.
- [x] 2.4 Add a headless reader and a reset for the anonymous plan (D6).
  - `readAnonymousPlan()` opens the `dcsplan-flightplan-ydoc` store and returns a snapshot.
  - `resetAnonymousPlan()` replaces its content with `newFlightPlan()` in one `'migration'` transaction.

  Verify with tests using `fake-indexeddb`: after a reset, a fresh `useYjsFlightPlan('local')` loads a fresh plan, and `clearPlanStore('local')` still refuses.

## 3. Import pipeline (design D2–D5; capabilities `plan-import`, `local-data-migration`)

- [x] 3.1 Define the pipeline types: a source, a destination, a preview with per-item counts (new / held / differs, profile new / present), a selection, and per-item outcomes.

  Verify with `tsc --noEmit`.
- [x] 3.2 Implement the file source by extracting the parse-and-validate logic out of `ImportFlightPlanDialog.tsx`. Give a file profile with no recorded id an id derived from a hash of its aircraft data (D4).

  Verify with unit tests:
  - the existing `ImportFlightPlanDialog.test.tsx` parsing cases pass against the source;
  - the same aircraft JSON always yields the same UUID-formatted id.
- [x] 3.3 Implement the local-data source on top of group 2. It yields only the items that meet the `local-data-migration` conditions, and assigns and persists `dcsplan.performance.importId` and `dcsplan.localImport.planId` once (D4).

  Verify with unit tests: a fresh device yields nothing; an edited plan alone yields only the plan; the ids are stable across two calls.
- [x] 3.4 Implement the preview over a destination's held entries and profiles, reusing `summarizeSnapshotMerge`.

  Verify with unit tests for the spec's scenarios: twelve referenced entries, eight held, gives four new and eight held; differing entries are counted; a profile id already present is reported as present.
- [x] 3.5 Implement the anonymous destination: replace the plan; merge entries into the imported plan's theatre; replace the profile only when it is selected.

  Verify with unit tests for the `plan-import` *Anonymous import replaces the single plan* scenarios and the `map-objects` deselection scenario.
- [x] 3.6 Implement `awaitAcked(sync, { entries, profiles }, timeoutMs)` on top of `AssetSync.subscribe`. It resolves when every row has a `seq` and no outbox key, and rejects on timeout.

  Verify with unit tests against `test/fakeAssetServer.ts`: it resolves after the drain, rejects on timeout, and already-acknowledged rows resolve at once.
- [x] 3.7 Implement the space destination in D3 order: entries, then profile, then acknowledgement, then set `profileId` on the plan, then `createPlan` with the seeded doc's encoded state. A 409 is treated as landed after a list refresh.

  Verify with unit tests against the fake server for the `plan-import` signed-in scenarios:
  - adds without replacing;
  - entries land in the imported plan's theatre;
  - a selected profile is added or reused, and a deselected new one leaves the null profile;
  - a failure before the plan creates no plan, and a retry adds one plan and no duplicate entries or profile.
- [x] 3.8 Implement move-off-device for the local-data source (D5). After each item's acknowledgement: remove its entries, reset the profile (dropping `importId`), and reset the anonymous plan (dropping `localImport.planId`).

  Verify with unit tests for the `local-data-migration` *Import moves local data off the device* and *A failed import keeps the local data* scenarios, including "library accepted, plan not".

## 4. Import chooser UI (capability `plan-import`)

- [x] 4.1 Build the presentational `ImportChooser`:
  - one checkbox per listed item, all ticked;
  - the plan item cannot be unticked;
  - new / held / differs counts;
  - consequence notes while an item is unticked;
  - Cancel, plus a configurable confirm (*Import* / *Replace*) and an optional *Not now*.

  Verify with component tests covering each *The import chooser lists what the file holds* and *Deselecting an item…* scenario.
- [x] 4.2 Turn `components/sidebar/ImportFlightPlanDialog.tsx` into a file picker plus the chooser, wired to the anonymous destination. Keep the replace warning.

  Verify with an updated `ImportFlightPlanDialog.test.tsx`: anonymous replace, profile kept when unticked, and the validation error shown with nothing changed.

## 5. Signed-in placement (design D8, D9; capabilities `plan-import`, `space`)

- [x] 5.1 In `Sidebar.tsx` and `ButtonZone.tsx`, offer no Import and move Export into a "⋯" dropdown (`@radix-ui/react-dropdown-menu`) when signed in. The anonymous sidebar keeps both primary buttons.

  Verify with component tests for both tiers.
- [x] 5.2 Add *Import* next to *New plan* on `PlansHomePage.tsx`, using the file source and the space destination. It is disabled with a hint while offline (D9). Insert the new plan into the in-memory list, then navigate to its address.

  Verify with `PlansHomePage.test.tsx`: the import adds a listed plan and opens `/p/:id/:slug`; the button is disabled offline; an existing plan is unchanged.

## 6. Sign-in migration (design D7; capability `local-data-migration`)

- [x] 6.1 In `AuthContext.login()`, set `sessionStorage['dcsplan.signingIn']` before redirecting.

  Verify in `AuthContext.test.tsx`.
- [x] 6.2 Add the `LocalDataMigration` component, mounted under the plan-selection and space-assets providers. It consumes the flag once authenticated and waits for a plan list loaded from the server and the first successful asset pull.
  - Empty space: import every item silently and open the imported plan.
  - Otherwise, or if either wait fails: show the chooser with *Not now*.
  - The flag is removed once consumed.

  Verify with component tests for the scenarios:
  - first sign-in to an empty account (no prompt, plan opened);
  - unknown contents give the chooser;
  - an account with data gives the chooser;
  - *Not now* changes nothing;
  - a reload with no flag does nothing;
  - a fresh device does nothing.
- [x] 6.3 Add the *Import local data from this device* banner on `/plans`, shown while the local-data source yields items and rechecked after each import. It opens the same chooser.

  Verify with `PlansHomePage.test.tsx`: the banner shows with local data, is absent without, disappears after a full import, and offers only the remaining items after a partial failure.
- [x] 6.4 Check that, while signed in, no surface shows or edits the anonymous data, and that logout brings back exactly what remains.

  Verify by extending `SignOut.test.tsx` for the `user-identity` and `plan-sync` logout scenarios: an imported plan gives a fresh anonymous plan, and an unimported library is preserved.

## 7. Architecture and project docs

- [x] 7.1 Amend AD-8 in `docs/architecture/centralized-flightplans.md`: move semantics, the per-item chooser, the silent import opening the plan, and logout no longer wiping the device. Amend AD-9: the anonymous library is permanent. Update the decision-map rows.

  Verify by reading both ADs: no statement still says logout clears the device or that the library is gated.
- [x] 7.2 Update the anonymous-tier vocabulary in `openspec/config.yaml` so the library is no longer listed as needing an account.

  Verify with `openspec validate add-local-data-import --strict`.

## 8. Integration checks

- [x] 8.1 Run the full suites: backend `pytest` in the venv, `pnpm --filter frontend test`, and `pnpm --filter frontend exec tsc --noEmit`. All must pass.
- [x] 8.2 Manual end-to-end with the app running:
  1. As an anonymous user, build a plan with a library ref, a marker and a profile.
  2. Sign in to an empty account: the plan opens with its ref resolved and its profile bound, and `/plans` shows no banner.
  3. Log out: the anonymous tier shows a fresh plan, an empty library and the default profile.
  4. Repeat against an account with data, choosing *Not now*, then import from the banner.
  5. Import an exported file from `/plans` with the profile unticked.

## Workflow follow-up

- Run `/opsx:verify`, then archive the change once reviewed.
