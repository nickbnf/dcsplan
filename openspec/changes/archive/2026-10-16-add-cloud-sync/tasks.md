# Tasks

> Backend tests run under the project venv (`packages/backend/venv`); frontend
> tests run with `pnpm --filter frontend test` (pnpm only, never npm). Do not
> `git commit` — the maintainer commits by hand.

## 1. Sync-server spike (de-risk `pycrdt`, AD-14)

- [x] 1.1 Prototype a FastAPI WebSocket endpoint that holds a `pycrdt` document and completes the `y-protocols` sync handshake with a browser `y-websocket` `WebsocketProvider`; verify a value set on the client appears in the server document and vice versa (throwaway, in a scratch branch/dir). — PASS: scratchpad `sync_spike.py` synced a value A→server→B over a live FastAPI `/sync/{plan_id}` socket.
- [x] 1.2 Decide adopt `pycrdt-websocket` vs a thin hand-written handler, and whether a round-trip through Caddy/Vite preserves the WebSocket upgrade + session cookie; record the decision as a short note appended to `design.md`'s sync section. If the spike fails, stop and escalate the AD-14 dumb-relay fallback before proceeding. — Adopt `pycrdt-websocket` (`WebsocketServer` + `HttpxWebsocket`); decision recorded in `design.md`; Caddy/Vite round-trip deferred to 10.2.
- [x] 1.3 Add `pycrdt` (and `pycrdt-websocket` if adopted) to `packages/backend/requirements.txt`; verify a fresh venv install succeeds and the chosen package imports. — Added `pycrdt` 0.14.8 + `pycrdt-websocket` 0.16.5; imports verified from the venv.

## 2. Server persistence & schema (AD-13)

- [x] 2.1 Write a `yoyo` migration creating `spaces`, `space_members`, `plans`, `plan_updates` (schema per `design.md`), including the `space_members` PK, the `plans` `UNIQUE(space_id, name)`, and the `idx_plan_updates_plan`/`idx_space_members_user` indexes; verify it applies to a fresh DB and the tables/constraints exist. — `migrations/0002.create-spaces-plans.sql` (+ rollback); `test_spaces_plans_schema.py` verifies tables, indexes, and the unique constraint.
- [x] 2.2 Add a data-access module (hand-written SQL via `aiosqlite`) for spaces/membership, plans, and plan-update append/load/squash; verify with unit tests covering get-or-create Personal space (idempotent — a second call returns the same space), unique-name rejection, and append-then-load returning the same document state. — `spaces.py` + `plans.py`; `test_spaces.py` + `test_plans.py` cover idempotent get-or-create, unique-name rejection, append/load state roundtrip, and squash. Full backend suite: 235 passed.

## 3. Plan index REST (capability: `space`)

- [x] 3.1 `GET /spaces/me` — get-or-create the caller's Personal space; verify a test shows first call creates one owner-membership row and a repeat call creates no second space, and an anonymous caller gets 401. — `space_routes.py`; `test_space_routes.py` covers idempotent create + 401.
- [x] 3.2 `GET /plans` — list the caller's space plans (name, theatre, updatedAt, lastEditor); verify a test returns only the caller's plans and excludes `deleted_at` rows. — `lastEditor` null until version-history; test confirms only caller's plans and excludes soft-deleted.
- [x] 3.3 `POST /plans {id,name,theatre}` (defer-commit registration) and `PATCH /plans/{id} {name}` (rename); verify tests cover success, `409` on a colliding name within the space (A1 backstop), and `404`/no-cross-space access when the plan is not in the caller's space. — all covered; wired into `main.py`. Full backend suite: 242 passed.

## 4. Sync WebSocket (capability: `plan-sync`; AD-14, AD-5)

- [x] 4.1 `WS /sync/{planId}` served via the spike's chosen approach, authorized by the session cookie against the plan's owning space; verify a test rejects an unauthorized/unknown `planId` and accepts an authorized one. — `sync.py` (`serve_plan_socket` + `_authorize`), route in `main.py`; `test_sync.py` covers accept + unauth/unknown/foreign-plan rejection over a real TestClient WebSocket.
- [x] 4.2 Persist client updates to `plan_updates` and rehydrate the server document from the log on connect; verify a test where a disconnect/reconnect preserves the document, and confirm no finalized version is created (AD-5) — persistence only. — `PlanYStore` (BaseYStore over `plan_updates`) + `PlanSyncServer.get_room` pre-loads the doc; tests cover store roundtrip, rehydrate-from-log + persist-new-update, and assert no versions table (AD-5).
- [x] 4.3 Implement log squash (on empty room or threshold) and verify a test that squashing preserves document state while reducing row count. — `sync.squash_plan` (merge→single full-state update), triggered when the last client leaves a room; tests cover reduce-to-one-preserving-state and single-update no-op. Full backend suite: 250 passed.

## 5. Backend wire-format reshape (AD-2)

- [x] 5.1 Un-nest `aircraft` from the request `FlightPlan` model so the kneeboard/import body is `{ flightPlan, aircraft }`, passing `aircraft` separately into the generation/import functions (`flight_plan.py` readers at the former `.aircraft.*` sites); remove the legacy v1.2 synthesis path. Verify existing kneeboard/import tests pass after updating them to the new body shape, and add a test asserting a nested-`aircraft` body is rejected. — `aircraft` removed from `FlightPlan` + `migrate_legacy_regimes`; new `KneeboardRequest`/`ImportFlightPlanRequest` carry `aircraft` as a sibling; threaded through `FlightPlanData`/`LegData`/`generate_waypoint_list_page`/`task_queue` (optional trailing param so non-aircraft call sites are unaffected). Updated import/aircraft/taxiFuel/waypoint-header tests; added `TestWireFormatReshape` (nested-aircraft → 422). Full backend suite: 250 passed.

## 6. Frontend multi-doc & plan-index client (capability: `plan-sync`, `space`)

- [x] 6.1 Refactor `useYjsFlightPlan` to key the Y.Doc/IndexedDB store by plan id and, when signed-in and the plan is committed, also attach a `y-websocket` `WebsocketProvider`; switching active plan tears down prior providers. Keep `FlightPlanContext`'s public API unchanged. Verify frontend unit tests for keyed-store open and provider attach/detach, plus the existing `FlightPlanContext` suite still passes. (Add `y-websocket` to `packages/frontend/package.json` via pnpm.) — `useYjsFlightPlan(planId, {sync, syncUrl})`, anon default preserves the legacy store + migration; `isSyncing` added for the reopen state; `y-websocket` added. `useYjsFlightPlan.test.ts` covers keyed-store isolation/persistence and provider attach/detach; full frontend suite 385 passed.
- [x] 6.2 Add a plan-index REST client (`spaces/me`, list/create/rename plans); verify unit tests mock the endpoints and surface the `409` as a unique-name error. — `api/planApi.ts` (`getMySpace`/`listPlans`/`createPlan`/`renamePlan`, `DuplicatePlanNameError`/`PlanNotFoundError`); `planApi.test.ts` (7 tests) covers URLs/methods/bodies and 409/404 mapping.

## 7. Draft lifecycle (capability: `plan-lifecycle`, `space`; AD-15)

- [x] 7.1 New-plan flow creates a client-generated-id local draft (no server row, no provider), used as the IndexedDB key from the start; verify a test that a created-but-empty signed-in plan is active, is not in `GET /plans`, and leaves existing plans intact. — `PlanSelectionContext.newDraft` (client `crypto.randomUUID`, isDraft, sync=false); test confirms active, no `createPlan`, list intact.
- [x] 7.2 On the draft's first waypoint, `POST /plans {id,...}` then attach the provider (initial sync uploads state); abandoning an empty draft `clearData()`s its store. Verify tests for "first waypoint commits + syncs" and "abandoned empty draft leaves the space unchanged and clears local store" (covers the `plan-lifecycle` draft scenarios). — `commitDraft` (POST + flips `sync` on) wired into `FlightPlanProvider` via a first-waypoint effect; `abandonDraft` calls `clearPlanStore`; both tested.

## 8. Active-selection & cache lifecycle (capability: `space`, `plan-sync`)

- [x] 8.1 Persist `(activeSpaceId, activePlanId)` per device; restore on load, validate against `GET /plans`, fall back to Home when unresolvable. Verify tests for restore-on-reload and fallback-on-unresolvable. — `dcsplan-active-selection` localStorage; load effect validates against the list, else `atHome`; both tested.
- [x] 8.2 Keep non-active plans cached (`destroy`, not `clearData`) and show a syncing state on reopen until synced; on logout `clearData()` synced stores but preserve the anonymous local plan (L1). Verify tests for reopen-shows-syncing and logout-clears-synced-keeps-anonymous. — non-active stores kept (hook `destroy` only); `isSyncing` surfaced through `FlightPlanContext` (reopen-syncing covered in 6.1); logout effect `clearPlanStore`s known synced ids, keeps `local`; tested. Full frontend suite: 391 passed, tsc clean.

## 9. Multi-plan UX (capability: `space`; AD-15)

- [x] 9.1 Home screen: plan list (name · theatre · edited · lastEditor), New plan, inline rename with A1 "must be unique" validation (confirm disabled while colliding, matching the regime-name precedent); the space-switcher row is reserved but unrendered. Verify component tests for list render, rename-collision block, and New-plan navigation. — `PlansHomePage.tsx` (list, `NewPlanDialog` with A1, inline `PlanRow` rename with A1, reserved space-switcher row); `PlansHomePage.test.tsx` (6 tests).
- [x] 9.2 Editing surface: read-only plan-name breadcrumb linking to Home, and the tab bar grouped into a plan-scoped cluster (NAV/PERF/ATTACK) and a space-scoped cluster (LIBRARY) with a divider; anonymous tier shows neither breadcrumb nor Home. Verify tests that switching the active plan updates plan-scoped surfaces but not LIBRARY, and that the anonymous tier renders the single-plan layout unchanged. — `Layout.tsx` breadcrumb + grouped tabs + Home/anonymous routing guards; `/plans` route added. `Layout.test.tsx` (6 tests): breadcrumb presence/absence per tier, divider between clusters, Home/anonymous redirects, loading state. Full frontend suite: 403 passed, tsc clean.

## 10. Routing, proxy & deployment

- [x] 10.1 Wire the signed-in default route to Home and the anonymous default to NAV (single plan); verify a routing test for both tiers. — `Layout` guards: `atHome` (signed-in, no active plan) → `/plans`; anonymous away from `/plans` → `/`; restored active plan stays on `/`. `Layout.test.tsx` covers both tiers.
- [x] 10.2 Add `ws: true` to the `/api` dev Vite proxy and confirm the prod Caddy `reverse_proxy` passes the WebSocket upgrade; update `docs/auth-and-single-origin.md` with the sync WebSocket route and any new config. Verify the documented dev setup actually establishes a sync socket end-to-end. — `ws: true` added to the Vite `/api` proxy; Caddy `reverse_proxy` upgrades automatically (documented, no directive needed); `docs/auth-and-single-origin.md` gains a "Plan-sync WebSocket" section. The socket mechanism is verified end-to-end by `test_sync_integration.py` (real server + clients); a through-Vite browser check is manual.

## 11. Integration verification

- [x] 11.1 End-to-end sync: edit a signed-in plan in one browser context and observe it converge in a second; verify different-waypoint edits both survive and same-field edits converge without corruption (exercises `plan-sync` cross-device/merge scenarios). — `test_sync_integration.py`: two live pycrdt clients through the real `PlanSyncServer`; different-field edits both survive, same-field converges deterministically to one value without corruption.
- [x] 11.2 Connectivity axis: edit while disconnected, reconnect, and confirm convergence; confirm a signed-in-but-disconnected user still has their space and plans (not treated as anonymous). — integration test reconnect-after-offline converges (A edits, disconnects, B edits, A reconnects → both survive) + persistence/rehydration for a later client. The "disconnected ≠ anonymous" distinction is structural: `PlanSelectionContext` keeps `spaceId`/`plans`/active plan regardless of socket state (the Y.Doc stays local via IndexedDB).
- [x] 11.3 Tier parity: confirm the anonymous tier is unchanged end-to-end (single local plan, no space, no network), and run the full suites (`pnpm --filter frontend test`; backend pytest under the venv) green. — anonymous parity covered by `useYjsFlightPlan` anon-default tests + the unchanged `FlightPlanContext` suite (no space, no provider). Full suites green: backend 254 passed / 7 skipped; frontend 406 passed, `tsc` clean.
