# Tasks

> Backend tests run under the project venv (`cd packages/backend && ./venv/bin/python -m pytest`);
> frontend tests with `./node_modules/.bin/vitest run` in `packages/frontend` (pnpm only, never npm),
> plus `tsc --noEmit`. Do not `git commit` — the maintainer commits by hand.

## 1. Backend: short ids, destructive migration, no rename

- [x] 1.1 Add `migrations/0003.recreate-plans.sql` (+ rollback) that drops and recreates `plan_updates` and `plans` as in `0002` without `UNIQUE(space_id, name)` (design D7); verify a schema test that two plans with the same name can coexist in one space and that `spaces`/`space_members` survive the migration.
- [x] 1.2 Remove `DuplicatePlanName` and `rename_plan` from `plans.py`, and `PATCH /plans/{id}` from `space_routes.py`; `POST /plans` validates the id against `^[1-9A-HJ-NP-Za-km-z]{12}$` (422 otherwise) and maps a duplicate id to `409`. Verify updated `test_plans.py` / `test_space_routes.py`: duplicate names accepted, malformed id rejected, duplicate id → 409, rename route gone (405/404).
- [x] 1.3 Reject sync sockets whose plan id is malformed before any DB lookup (design D1); verify a `test_sync.py` case.

## 2. Backend: the listed name follows the document

- [x] 2.1 Pass the room's `ydoc` into `PlanYStore`; in `write`, read `flightPlan.name` from the server doc and, on change, update `plans.name` + `updated_at`, otherwise refresh `updated_at` only (design D2). Verify tests: a name change applied to a room's doc updates `plans.name`; a non-name edit bumps `updated_at` without touching the name; updates applied after a reconnect (offline rename) update the index.

## 3. Frontend: short ids and API cleanup

- [x] 3.1 Add `utils/planId.ts`: 12-character base58 ids via `crypto.getRandomValues` with rejection sampling, plus an `isPlanId` check (design D1). Verify unit tests: length/alphabet, never `local`, and a uniformity smoke test over many ids.
- [x] 3.2 Use the short id in `PlanSelectionContext.newDraft` (returning the id) and drop `renamePlan` / `DuplicatePlanNameError` from `planApi.ts`. Verify updated `planApi.test.ts` and selection tests.

## 4. Frontend: the URL is the active selection

- [x] 4.1 Make `PlanSelectionProvider` derive the active plan from `matchPath('/p/:id/*', pathname)` per the design D3 table (local/anon, space list, current draft, unresolved, non-`/p/` routes via the stored pointer), waiting on `isLoadingSelection` for signed-in users; remove `renamePlan`, `activePlanName` and the draft-name bookkeeping. Verify tests (rendered in a `MemoryRouter`) for every row of the D3 table, including "resolution waits for the plan list".

## 5. Frontend: routes, canonical slug, layout, home

- [x] 5.1 Implement the D4 route table in `App.tsx`: `/p/:id/:slug` parent with index (NAV), `perf`, `attack` children; `/p/:id` → canonical; `/`, `/performance`, `/attack` → the active plan's address (or Home when signed-in with none). Slugs from `slugifyPlanName`, falling back to `plan`. Verify routing tests for each legacy redirect, `/p/:id`, and a plan named "perf".
- [x] 5.2 Add `useCanonicalPlanPath` in the `/p/:id/:slug` parent (design D5) replacing the address in place when the slug disagrees with the plan's name. Verify tests: stale slug corrected; a rename updates the slug while the editor component instance stays mounted; a remote rename (doc update) updates the slug; navigation uses `replace` (no history entry).
- [x] 5.3 `Layout`: tab links built from the active plan's address (`/p/{id}/{slug}`, `…/perf`, `…/attack`), LIBRARY at `/library`, breadcrumb from `flightPlan.name`; move the old Home/anonymous guards into the new resolution/redirects. Verify updated `Layout.test.tsx`.
- [x] 5.4 `PlansHomePage`: remove inline rename and the New-plan uniqueness check; selecting a plan navigates to its address; New plan creates the draft and navigates to its address. Verify updated `PlansHomePage.test.tsx`.

## 6. Documentation and verification

- [x] 6.1 Record the addressing decision in `docs/architecture/centralized-flightplans.md` as AD-16 (short client-generated ids, `/p/:id/:slug`, URL as the active selection; enables AD-10 share links), amend AD-15's "active plan is a per-device pointer" consequence, and add the map row. Verify the document reads consistently (AD-15 no longer contradicts AD-16).
- [x] 6.2 Run both full suites and `tsc` green; manually check in the browser: renaming a plan keeps the waypoint tool selected and updates the address, reloading on a plan address reopens it, and an anonymous user lands on `/p/local/…`.

## 7. Draft lifecycle follow-up (found in local testing)

- [x] 7.1 Commit a draft only from its own document (`loadedPlanId === activePlanId`), fixing empty drafts committed by the previous plan's stale snapshot; verify `FlightPlanContext.commit.test.tsx` reproduces the bug and passes with the fix.
- [x] 7.2 Commit a draft on its first user edit of any kind (Y.Doc update with a user origin, not the seed); discard on leave only if no commit was ever attempted. Verify tests: rename-only and parameter-only edits commit; the seed and IndexedDB load do not; an unchanged draft is discarded; an edited draft is not.
- [x] 7.3 Keep a draft whose commit failed (`pendingCommit`), retry on `online` and on the next edit, reconcile a `409` by refreshing the list, and show the failure in the top bar. Verify tests for retry-on-online, retry-on-edit, 409 reconciliation, and the visible notice.
- [x] 7.4 Add the `plan-lifecycle` delta (first edit of any kind, pristine-only discard, kept-and-retried). Verify `openspec validate --strict`.

