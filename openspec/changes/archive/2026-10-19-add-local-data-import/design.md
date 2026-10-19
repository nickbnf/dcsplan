# Design

## Context

See proposal.md for motivation, and `specs/` for the behaviour: `plan-import` and `local-data-migration` carry most of it. The current mechanics that shape the approach:

- **The anonymous plan** is a Y.Doc in the IndexedDB database `dcsplan-flightplan-ydoc`, under the reserved id `local` (`hooks/useYjsFlightPlan.ts`). `clearPlanStore` deliberately refuses to delete it.
  - No helper says whether a plan differs from a fresh one. The only check is "has waypoints" (`NewFlightPlanDialog.tsx`).
- **A signed-in plan reaches the server in two steps.** `POST /plans {id, name, theatre}` registers it. The content then travels over the y-websocket handshake when the editor attaches the provider. Nothing acknowledges that the server holds the content: the provider's `synced` event fires when the client has the server's state, not when the server has the client's.
- **The library and profiles** go through `AssetSync` (`sync/assetSync.ts`):
  - writes enter an outbox and are sent in order;
  - a row is acknowledged when its cached `seq` is set and its outbox key is gone;
  - writes are safe to create: putting an id the server already holds adopts the server's copy;
  - entries for a theatre whose library id is unknown are routed when sent (`add-library-profile-sync` D7).
- **Anonymous library and profile** live in localStorage under `dcsplan.library.<theatre>` and `dcsplan.performance`. While signed in, `PerformanceContext` and `LibraryContext` do not write these keys.
- **Sign-in is a full-page redirect** through Discord and back to `/`. A new sign-in looks exactly like reloading an existing session: both go `loading` → `authenticated`.
- **File import** parses the file on the client, then validates it through the stateless `POST /flightplan/import`. That call needs the server.

## Goals / Non-Goals

**Goals:**
- One import pipeline behind both entry points: a file (both tiers) and local data (sign-in or `/plans`). The pipeline previews, lets the user choose, executes, and confirms.
- A real server acknowledgement for each imported item, so that moving data off the device never removes something the server does not hold.
- Retries that are safe to repeat: re-running an import that half failed adds nothing twice.

**Non-Goals:**
- Making file import work offline. The validation endpoint and plan creation both need the server.
- A general "background job" mechanism. An import runs while its dialog or the sign-in flow is open. If the tab closes mid-import, the remaining local data stays and is offered again from `/plans`.
- Changing how the editor syncs a plan once it is open.

## Decisions

### D1. Plans are created with their content in one request

`POST /plans` gains an optional `initialState`: a base64-encoded Yjs update (`Y.encodeStateAsUpdate` of a doc seeded with `seedYDoc`). The server stores it as the plan's first `plan_updates` row, in the same transaction as the `plans` row. The existing size limit for request bodies applies. The 201 response is then the acknowledgement for the whole plan.

The client keeps generating the id (AD-16). A 409 on retry is resolved the same way `commitDraft` does it: refresh the list and treat the plan as landed if the id is there.

*Alternatives.*
- *A headless Y.Doc plus `WebsocketProvider`, waiting for `synced`.* No backend change, but no acknowledgement either. `synced` does not mean the server has stored the client's update, so move semantics could delete the only copy.
- *Create the plan as a draft and let the editor upload it.* Same missing acknowledgement, and it needs the editor to be open.
- *A separate `PUT /plans/{id}/state`.* Two requests, with a window where the plan is listed but empty.

### D2. One pipeline: source → preview → selection → destination

```
Source (file | local data)  ─┐
                             ├─► preview(source, destination) ─► Chooser ─► execute(selection)
Destination (anon | space) ──┘
```

- **Source.** It yields the plan (`FlightPlan`), the library entries grouped by theatre, and the profile `{id?, aircraft}`.
  - *File source:* the existing parsing and validation from `ImportFlightPlanDialog`. The library entries are the snapshot, all in the plan's theatre.
  - *Local-data source:* reads the anonymous Y.Doc headlessly (D6), every `dcsplan.library.*` key, and `dcsplan.performance`. It only yields items that meet the conditions in `local-data-migration`.
- **Destination.**
  - *Anonymous:* the local stores. Its plan step replaces the single plan.
  - *Space:* `AssetSync` for entries and the profile, and `POST /plans` (D1) for the plan.
  - Both expose what they already hold (entries by UUID, profiles by id), which feeds the counts: new, already held, differs (`summarizeSnapshotMerge`).
- **Chooser.** One presentational component, used by the anonymous sidebar, `/plans`, and the sign-in flow. It knows nothing of where items come from or go.
- **Execute.** Runs the selected steps in a fixed order (D3) and returns the outcome of each item.

*Alternative:* three dialogs, one per entry point. That would mean three copies of the counting and ordering rules the specs make identical.

### D3. Order: library, then profile, then plan, each acknowledged before the next

The space destination runs these steps in order:
1. Put every selected entry through `AssetSync.putEntry(theatre, entry)`, keeping each entry's UUID.
2. Put the profile through `putProfile`.
3. Wait until each of those rows is acknowledged. A small `awaitAcked(ids, timeout)` helper subscribes to `AssetSync`.
4. Set `profileId` on the plan and `POST` it (D1).

The plan is last, so a failure never leaves a plan whose selected items are missing. Entries keep their UUIDs, so the plan's `libraryRefs` need no rewriting.

If a step times out or fails, execution stops and reports it. Rows already queued stay in the outbox and are delivered later; that is harmless because those writes are safe to create.

The anonymous destination does the same steps synchronously against localStorage and the plan doc, with no acknowledgement to wait for.

### D4. Retries reuse the ids from the first attempt

- **Library entries** keep their own UUIDs, so repeating a put is a no-op.
- **Local profile.** It has no id (`performance-profile`, *Profile identity*). The pipeline gives it one the first time and stores it as `dcsplan.performance.importId` until the profile is acknowledged and reset. A retry reuses that id.
- **File profile without a recorded id** (older files). Its id is derived from a hash of its aircraft JSON, formatted as a UUID. Importing the same file again then finds the same profile.
- **The plan.** For local data, its id is generated once and stored as `dcsplan.localImport.planId` until the plan is acknowledged; a retry gets a 409, which counts as landed (D1). For a file, the id lives for the open dialog only. The plan is the last step, so a failure before it creates no plan.

*Alternative:* deduplicate by content at import time. AD-8 rejects content-level deduplication for plans, and a content hash is only used here as a stable id for an otherwise anonymous profile.

### D5. Local data is moved per item, once acknowledged

After an item is acknowledged:
- **Library entries:** removed from their `dcsplan.library.<theatre>` key, and the key is cleared when it becomes empty.
- **Profile:** `dcsplan.performance` is reset to `defaultAircraft()`, and `importId` is dropped.
- **Plan:** the anonymous doc is reset to a fresh plan (D6), and `localImport.planId` is dropped.

The anonymous providers (`PerformanceContext`, `LibraryContext`) keep in memory the copy they read at page load. When the user leaves the signed-in tier, they re-read storage instead of writing that copy back. Otherwise a logout in the same session would restore what the import had moved.

When the space already held an entry's UUID, `AssetSync` adopts the server's copy. The local copy is still removed, as the spec states, and the chooser shows the count of entries that differ before import.

### D6. Reading and resetting the anonymous plan while signed in

A headless reader opens `IndexeddbPersistence('dcsplan-flightplan-ydoc', doc)`, waits for `synced`, and takes `snapshotFromYDoc`. Resetting clears the doc's `flightPlan` map and seeds `newFlightPlan()` in one transaction with origin `'migration'`, then destroys the provider. `clearPlanStore` keeps refusing to delete the anonymous store; the reset keeps the store and replaces its content.

**"Differs from fresh."** A new `isFreshPlan(plan)` compares against `newFlightPlan()` while ignoring `theatre`:
- no points, `libraryRefs`, `markers` or `attackPlanning`;
- default parameters;
- default name.

**Profile.** `isDefaultAircraft(aircraft)` deep-compares against `defaultAircraft()`.

**Library.** The non-empty `dcsplan.library.*` keys are found by scanning localStorage, the way `sweepUser` already scans keys.

### D7. Detecting a fresh sign-in

- **Marking it.** `login()` sets `sessionStorage['dcsplan.signingIn'] = '1'` before redirecting. A sessionStorage flag is per tab and survives the OAuth round trip in that tab, but it does not leak into other tabs or later sessions.
- **Running the flow.** A `LocalDataMigration` component, mounted under `PlanSelectionProvider` and `SpaceAssetsProvider`, consumes the flag once `status === 'authenticated'`. It then waits for two things:
  - a plan list loaded **from the server**, not from the cached index;
  - the first successful asset pull.
- **Choosing the path.**
  - If either wait fails, the account counts as not empty and the chooser is shown.
  - If the space holds no plans, no entries and no profiles, the import runs silently, and the imported plan opens with `navigate(planPath(id, name))`.
  - Otherwise the chooser is shown.
- **The flag is removed when it is consumed,** so a reload never runs the flow a second time.

*Alternatives.*
- *A query parameter via `POST_LOGIN_REDIRECT`.* It needs a backend configuration change, and it stays in the URL unless it is cleaned up.
- *Comparing `dcsplan.lastUser` before and after.* It is ambiguous for a returning user.

### D8. Placement in the UI

- **`/plans` header.** A secondary *Import* button sits next to *New plan*. It opens the file picker and then the chooser.
- **Local-data banner.** When local data exists, a banner above the list offers *Import local data from this device*. It is computed by the local-data source's detection and checked again after each import.
- **Signed-in sidebar.** `ButtonZone` drops `importTrigger`. Export moves into a "⋯" menu built on `@radix-ui/react-dropdown-menu`, which `FlightPlanZone` already uses.
- **Anonymous sidebar.** It keeps Import and Export as primary buttons. Its dialog becomes the chooser with the anonymous destination.
- **Navigation after a signed-in import.** The new plan is added to the in-memory plan list before navigating, so plan resolution does not fall back to Home before the next list refresh.

### D9. Signed-in import checks connectivity first

The `/plans` import is disabled while `AuthContext.connectivity` reports offline, with a hint that it needs a connection. A connection lost mid-import surfaces through D3's failure path. The validation call is unchanged and also fails offline.

## Risks / Trade-offs

- **[The plan uses a new create path, and the editor's sync handshake must merge with the stored initial update.]** → The server stores the update exactly as a sync write would. A backend test opens a socket on a plan created with `initialState` and checks the content arrives. A frontend test does a round trip through `seedYDoc` → encode → create → open.
- **[`initialState` adds to the request size.]** → Plans are small. The existing body limit applies, and an oversized plan fails with a clear error and nothing is created.
- **[The acknowledgement wait can stall on a slow connection.]** → A generous timeout (30 s). On timeout the import reports a failure and keeps the local data; the queued writes still drain, and a retry is idempotent (D4).
- **[The sessionStorage flag misses a sign-in completed in another tab.]** → That tab gets no prompt, but the `/plans` banner still offers the import.
- **[A profile id derived from a hash can make two different files share one profile]** if their aircraft data is identical. → Identical aircraft data means the same profile in practice, so this is accepted.
- **[A local library entry that differs from the space's copy is dropped on move.]** → The chooser states the count before import (spec). No recovery path until `add-version-history`.
- **[A user edits the anonymous plan in another tab while it is being imported.]** → Unlikely, since the other tab would also be signed in and so not editing the anonymous plan. Not handled further.

## Migration Plan

1. **Backend.** Make `initialState` on `POST /plans` optional and additive. There is no schema migration, because it writes to the existing `plan_updates` table. A client that does not send it behaves as before.
2. **Frontend and backend ship together** (same origin).
   - Signed-in users with leftover local data from before this change see the `/plans` banner.
   - Nobody is prompted on reload: only a fresh sign-in sets the flag.
3. **Docs** (cross-capability, so they go outside this design):
   - amend AD-8 (move semantics, the per-item chooser, logout no longer wiping the device) and AD-9 (the anonymous library is permanent) in `docs/architecture/centralized-flightplans.md`, and update the decision map;
   - update the anonymous-tier vocabulary in `openspec/config.yaml`.
4. **Rollback.** Revert the frontend; the old client ignores `initialState`. Imported data stays in accounts. Local data already moved does not come back, which is the intended effect.

## Open Questions

- The exact acknowledgement timeout, and the wording of the banner and the chooser's consequence notes. These can be tuned during implementation.
