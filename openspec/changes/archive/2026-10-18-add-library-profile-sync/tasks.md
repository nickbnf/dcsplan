# Tasks

> Backend tests run under the project venv (`packages/backend/venv`). Frontend
> tests run with `pnpm --filter frontend test`, and type-checking with
> `pnpm --filter frontend exec tsc --noEmit` (pnpm only, never npm). Do not
> `git commit`: the maintainer commits by hand. "D-n" refers to `design.md`.

## 1. Server schema and data access (AD-13, AD-17; design D1–D3)

- [x] 1.1 Write the yoyo migration `0004.create-libraries-profiles.sql` and its rollback, per D2:
  - the `asset_seq` counter;
  - `libraries`, with `UNIQUE(space_id, theatre)` and the reserved `name` and `parent_id` columns;
  - `library_entries` and `profiles`, keyed `(space_id, id)`, with tombstone columns and `seq` indexes.

  Verify with a schema test (in the style of `test_spaces_plans_schema.py`): the tables, primary keys, the unique constraint and the indexes exist, and the rollback removes them.
- [x] 1.2 Add `assets.py` (hand-written SQL; one module for libraries, entries, profiles and the feed, since they share the seq counter and D3's rules) for:
  - next-`seq` allocation inside the write transaction;
  - get-or-create of a space's library for a theatre, returned as a list.

  Verify with unit tests:
  - get-or-create is idempotent;
  - two spaces get distinct libraries for the same theatre;
  - every write strictly increases `seq`.
- [x] 1.3 Add entry and profile upsert and delete following D3's table (no row / live / tombstone, each for an edit or a create).

  Verify with unit tests, one per cell of the table:
  - a create over a live row is ignored, and returns the server's row;
  - an edit over a tombstone is ignored;
  - a create over a tombstone revives the row;
  - the same entry id in two spaces does not collide;
  - a write naming a different library from the stored one is refused.
- [x] 1.4 Add the change query: libraries, entries and profiles of a space with `seq > since`, tombstones included, plus the new cursor.

  Verify with unit tests:
  - `since=0` returns everything;
  - a later cursor returns only newer rows;
  - other spaces' rows are never included.

## 2. REST routes (capability: `space-asset-sync`; design D4, D5)

- [x] 2.1 Add `asset_routes.py` with the D4 routes behind `require_user`, scoped to the caller's Personal space, and wire it in `main.py`. Validate payloads with `flight_plan.LibraryObject` and `{ name, aircraft: Aircraft }`, using `extra="forbid"`, and cap request bodies at 256 KiB.

  Verify with route tests:
  - 401 when anonymous;
  - 404 for another space's library;
  - 409 when the library in the path doesn't match the entry's;
  - 422 for an unknown field, a blank profile name, or a path id that differs from the body id;
  - 413 for an oversized body;
  - the `{ applied, seq, entry|profile }` response shape for each D3 case.
- [x] 2.2 Verify that `GET /libraries?theatre=` always returns a one-element list and that `GET /changes` serves an initial load and a later incremental pull. Write it as a route test that creates entries and profiles, deletes one, and pulls from both cursors.

## 3. Client sync store (capability: `space-asset-sync`; design D6, D7)

- [x] 3.1 Add `api/assetApi.ts`, the REST client for the D4 routes, in the style of `planApi.ts`. Verify unit tests that mock `fetch` and check URLs, methods, bodies, and the mapping of `applied: false` and errors.
- [x] 3.2 Add the per-user local store under `dcsplan.u.<userId>.*`: libraries by theatre, entries per library, profiles, tombstones and the cursor.
  - Applying a change-feed batch updates entries, profiles and tombstones.
  - A prefix sweep clears the whole store.

  Verify with unit tests that a feed batch with upserts and tombstones applies correctly, and that the sweep leaves the anonymous keys (`dcsplan.library.*`, `dcsplan.performance`) untouched.
- [x] 3.3 Add the outbox: a map keyed by `(kind, id)`, so a newer write replaces a pending one, with a 400 ms per-row debounce and back-off on failure.
  - At most one write per row is in flight, and a newer write takes its `baseSeq` from the in-flight reply (D3).
  - An `applied: false` reply makes the device adopt the server's row, or drop its copy for a tombstone.
  - Writes for a theatre whose library id isn't known yet are queued against the theatre and resolved through `GET /libraries` before being sent.

  Verify with unit tests:
  - coalescing;
  - an edit made during an in-flight create is not lost;
  - adoption on a create over a live row;
  - an offline first-visit theatre write lands in the right library after reconnect.
- [x] 3.4 Add the pull loop: on start, after the session is confirmed, on `online`, on `visibilitychange` to visible, every 60 s while visible, and after the outbox drains. Expose a "caught up" state: the last pull succeeded and the outbox is empty.

  Verify with fake-timer tests that each trigger pulls, and that "caught up" turns false while a write is pending or a pull fails.

## 4. Offline start and remembered session (capability: `user-identity`; design D9)

- [x] 4.1 Extend `AuthContext`:
  - Remember the user and space summary, plus a `dcsplan.lastUser` pointer, on every confirmed session.
  - On a network error or 5xx from `/auth/me` with a remembered user, start authenticated with `connectivity: 'offline'`, retrying with back-off and on `online`.
  - A 401 or `authenticated: false` behaves as today.

  Verify with `AuthContext` tests: offline start with a remembered user is signed in and offline; offline start with no remembered user is anonymous; reconnect plus a confirmed session clears offline mode; reconnect plus a 401 ends the session.
- [x] 4.2 Cache the space summary and plan list in the per-user namespace in `PlanSelectionContext`, and resolve from the cache when the network is unavailable. Verify with tests that an offline start opens a previously opened plan at its address instead of falling back to Home, and that the online path is unchanged (the existing suite passes).
- [x] 4.3 Show the disconnected and syncing state in the app chrome (next to the auth menu), driven by `connectivity` and the store's "caught up" state. Verify with a component test covering connected and caught up, syncing, and disconnected.

## 5. Library by tier (capabilities: `theatre-library`, `space`; design D8)

- [x] 5.1 Make `LibraryContext` pick its store by tier: the unchanged localStorage functions when anonymous, the synced store when signed in. Keep its public API, re-render on remote changes, and add `entryStatus(id)` returning `present`, `deleted` or `pending`.

  Verify with tests:
  - the anonymous behaviour is unchanged (the existing `LibraryContext` suite passes as-is);
  - a signed-in edit lands in the outbox and not in the anonymous keys;
  - a theatre switch never writes the outgoing entries under the incoming library, in either tier;
  - `entryStatus` follows the caught-up rule from the `map-objects` spec.
- [x] 5.2 Route library JSON import (merge and Replace) and the deletion of entries through the context so the signed-in tier syncs them. Verify with tests that a signed-in merge import sends creates only for new UUIDs, that Replace sends deletes and then creates, and that deleting an entry referenced by the active plan still removes the reference.

## 6. Missing-object placeholder and import summary (capability: `map-objects`; design D7a)

- [x] 6.1 Render unresolved library refs in the Objects tab as placeholder cards: a generic pictogram, the per-plan comment shown read-only, and a *deleted* or *not synced yet* state from `entryStatus`. *Deleted* offers Remove from plan with the usual confirmation; *not synced yet* is neutral and offers no removal. Opening a plan never alters its refs.

  Verify with `ObjectsZone` tests for both states, both tiers (anonymous shows only *deleted*), removal, and a pending card turning into a normal card when the entry arrives.
- [x] 6.2 Confirm unresolved refs are skipped without error on the map, the range rings and the kneeboard request.

  Verify with:
  - a `planObjectsLayer` unit test: one unresolved ref and two resolved refs draw exactly two features plus their rings;
  - a backend kneeboard test: a ref with no snapshot entry draws no pictogram or ring and raises nothing. The request still carries the ref; only resolved entries get a snapshot.
- [x] 6.3 Extend the plan-import library merge summary with **kept, differs**: compare the library-owned fields (type, position, name, default comment, range) with the importer's copy, and state that the plan shows the library's version. Signed-in merges send creates through the store, so the create-only rule holds.

  Verify with `ImportFlightPlanDialog` tests: N kept of which M differ, no differs line when all match, and a previously deleted entry counted as added.

## 7. Profile collection (capability: `performance-profile`; design D8)

- [x] 7.1 Turn `PerformanceContext` into a collection: `profiles`, `editingProfileId`, CRUD, and `resolvedProfile` for the active plan.
  - Anonymous presents its single `dcsplan.performance` profile as a collection of one with no id. Its storage is unchanged.
  - Signed in uses the synced store, with ids from `crypto.randomUUID()`.

  Verify with tests: the anonymous behaviour is unchanged (the existing Performance suites pass); signed-in create, rename and delete go through the outbox; duplicate names are accepted; an empty name is rejected.
- [x] 7.2 Build the profile management area on the Performance page for signed-in users: the "Edit profile" selector, create, rename, delete, and import/export. Import adds a new profile, and a plan import with a `performanceSnapshot` adds it, or reuses a matching id, and points the plan at it.

  Verify with `PerformancePage` and `PerformanceImportDialog` tests: anonymous shows no management controls; signed-in import grows the collection; selecting a profile for editing doesn't change the plan.

## 8. Plan's profile and orphan regimes (capabilities: `performance-profile`, `performance-regime`; design D10, D10a)

- [x] 8.1 Add `profileId` as a scalar key in `yjsFlightPlanBinding.ts` (signed-in only), and resolve the plan's profile from it, falling back to the null profile when it is absent or dangling. Verify with binding round-trip tests, and resolution tests for valid, absent and dangling ids and an empty collection.
- [x] 8.2 Build the header chooser on the Performance page ("This plan flies: …"), visually separate from the management area: a divider, a distinct heading and plan-scoped styling. The management area states when the profile being edited isn't the one the plan flies.
  - A switch clears only legs **bound** in the current profile, in one Y transaction, after the confirmation naming the bound-leg count.
  - Orphan `regimeId`s are left untouched.

  Verify with tests: the confirmation appears only with bound legs; orphans survive a switch and resolve in the new profile; the signpost appears for a non-flown profile; anonymous users have no chooser.
- [x] 8.3 Limit `RegimeConsistencyGuard` to the anonymous tier, and make signed-in leg computation treat an unresolved `regimeId` as Manual at read time, without writing. Verify with tests that a signed-in plan opened with a not-yet-synced profile keeps its `regimeId`s and computes Manual, then computes from the regime once the profile arrives, and that the anonymous orphan clearing is unchanged.
- [x] 8.4 Profile deletion: deleting the profile the active plan flies clears its bound legs and `profileId` after confirmation; other plans are not touched. `GenerateDialog` and leg computation read `resolvedProfile`. Verify with tests for both deletion cases, and a kneeboard request test showing the chosen profile's `aircraft` is sent.
- [x] 8.5 Fix the plan-endpoint request bodies (found during this change; broken since `add-cloud-sync`): plan import and kneeboard generation sent `aircraft` nested in or mixed into the plan, so the backend answered 422. Build both bodies with pure builders in `utils/wireFormat.ts` (`{ version, flightPlan, aircraft }` and `{ flightPlan + librarySnapshot, aircraft }`), and pin them with a shared fixture (`shared/wire-format-fixtures/requests.json`) checked from both sides. — `wireFormat.test.ts` (builders produce the fixture) and `backend/test_wire_format_contract.py` (fixture validates against `KneeboardRequest` / `ImportFlightPlanRequest`) pass; posting the fixture bodies to the real endpoints passes request validation (import 200; kneeboard reaches its content checks).

## 9. Logout (capability: `space-asset-sync`; design D11)

- [x] 9.1 Before logout, if the outbox isn't empty, confirm with the count of unsent changes. On confirm, sweep `dcsplan.u.<id>.*` and `dcsplan.lastUser`; synced plan stores are cleared as today. Verify with tests that a logout with pending writes warns and a cancel keeps the session, that a confirmed logout leaves the anonymous library and profile exactly as before sign-in, and that a later offline start is anonymous.

## 10. Integration checks

- [x] 10.1 Run the full suites green: backend pytest under the venv, `pnpm --filter frontend test`, and `pnpm --filter frontend exec tsc --noEmit`. Record the counts here. — Backend 309 passed / 7 skipped; frontend 48 files / 536 passed; `tsc --noEmit` clean; `pnpm build` succeeds.
- [x] 10.2 Two-browser manual check through the dev proxy, signed in as the same user:
  - a library entry edit and a profile edit appear on the other browser within one pull;
  - a delete on one browser shows the *deleted* placeholder in a plan on the other;
  - a concurrent edit to the same entry converges to the last write.

  Outcome: done by the maintainer in two signed-in browsers; works as specified.
- [x] 10.3 Offline manual check:
  - Start offline after a signed-in session: the space, a previously opened plan, the library and the profiles are available.
  - Edit, create a profile and assign it, then reconnect: the changes reach the other browser.
  - Import a plan while behind, with a snapshot entry the server already holds at a different position: the server copy is kept.

  Outcome: done by the maintainer; works as specified.
- [x] 10.4 Anonymous parity: with no session, confirm nothing calls the asset routes (network panel), and that the library, the profile, import/export and orphan-regime clearing behave as before. Record the outcome here. — Browser run against a scratch backend (port 8765, scratch DB): the anonymous session called only `/auth`, `/theatres` and `/tiles` (no asset, space or plan routes); the device-local Syria library and the `dcsplan.performance` profile (name, regimes) load as before; no profile chooser or management area; no `dcsplan.u.*` keys written. Orphan clearing stays covered by `RegimeConsistencyGuard.test.tsx` (anonymous case).

## 11. PERF page layout and profile labels (revision after first use; design D10a)

- [x] 11.1 Remove the profile name from the data model: a `profileLabel(aircraft)` helper ("model · take-off configuration", either alone, or "Untitled profile"); the server stores `{ aircraft }` (route, `assets.py` docs, fake server); `dcsplan.performance` is `{ version, aircraft }` with any old `name` ignored; `.perf.json` export omits `name`; plan export's `performanceProfile` keeps only `id`; the pre-mount bootstrap no longer writes a name. Verify with backend route tests (a `name` is now rejected as unknown), label unit tests, storage/export/import tests, and the existing suites updated. — Backend: a profile is `{ aircraft }` and a `name` is rejected as unknown (route tests). Frontend: `profileLabel()` in `types/flightPlan.ts`; storage, bootstrap, `.perf.json` import/export and plan export no longer carry a name; old names are read and ignored (storage, migration and import tests).
- [x] 11.2 Signed-in Performance page: the header band holds only "This plan flies" (profiles by label plus "No profile"); a profile sidebar lists profiles by label with the edited one bold and the flown one tagged FLOWN, "+ New" and "⬆ Import" at the bottom; the "Edit profile" dropdown, the management bar and the not-flown notice are gone. Export and Delete move beside the aircraft identity. Verify with `PerformancePage.signedIn.test.tsx` rewritten for the sidebar. — `ProfileSidebar` / `DeleteProfileButton` / label-based chooser in `components/performance/ProfileControls.tsx`; the management bar and signpost are gone. `PerformancePage.signedIn.test.tsx` rewritten (10 tests).
- [x] 11.3 Profile area in both tiers: aircraft identity, then a *General performance* line (taxi fuel, take-off), then regime chips with "+ Add regime", then the regime editor at full width; no profile-name field. Verify with `PerformancePage.test.tsx` (anonymous) updated for chips and the section order, and a browser check of both tiers' layout. — Three sections plus a full-width editor in `PerformancePage.tsx`; anonymous layout tests added (3). Browser check against a scratch backend with a throwaway session: signed-in page shows the band, the profile list (F-15E MIL tagged FLOWN and bold, F-15E AB, A-10C "no T/O config") and the chips; anonymous page shows the same profile area with no band or list; logout cleared the user's local data.
- [x] 11.4 Fix (reported after first use): renaming a plan and going back to the Flight Plans list showed the old name until a reload, because the list was only fetched at sign-in and after a draft committed. The open plan's name now updates its list row as it changes (`notePlanName`, from `FlightPlanContext`), and Home re-fetches the list each time it is shown, for renames made on other devices (`plan-sync`). — Tests in `PlanSelectionContext.test.tsx`, `FlightPlanContext.commit.test.tsx` and `PlansHomePage.test.tsx`; browser check with a scratch backend: rename "Alpha" → "Bravo", back via the arrow, the list shows "Bravo" without a reload.

## Workflow follow-up

- Update `openspec/config.yaml` → `context:` to mention AD-12…AD-17 if its "AD-1…AD-11" range is still stale.
- Archive the change with `/opsx:archive` once implementation and review are done; this syncs the delta specs into `openspec/specs/`.
