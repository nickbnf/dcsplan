# Proposal

## Why

`add-cloud-sync` put flight plans on the server, but the theatre library and the performance profiles still live only in the browser's localStorage. A synced plan opened on a second device therefore silently loses its library objects, and it has no profile to fly. This change finishes Phase 0's "server persistence for the three entities". It moves the library and the profiles into the Personal space for signed-in users and syncs them across devices with last-write-wins (AD-6). `add-local-data-import` (AD-8) and `add-version-history` (AD-3) both depend on these entities existing on the server.

## What Changes

- **Signed-in tier: the library and profiles are owned by the space (AD-1, AD-2).** The Personal space holds:
  - a **flat list of performance profiles**;
  - **exactly one library per theatre**, created the first time it is needed.

  The active space scopes both (AD-15). Both tiers keep the current data model of a library entry and of a profile.
- **Last-write-wins sync (AD-6).** Each library entry and each profile is synced as a whole. A concurrent edit to the same entry or profile resolves to the last writer. Edits to different entries or profiles never conflict. Library entries keep their existing UUIDs, and profiles get ids created on the device, so creation needs no server round-trip.
- **Offline editing while signed in.** A signed-in user keeps a local copy of the space's profiles and libraries and can keep editing while disconnected. Edits are queued and pushed on reconnect, resolving by last-write-wins. Reconnecting is not a downgrade to the anonymous tier (AD-9). On logout, the cached copies of the space's library and profiles are cleared, as for synced plans.
- **A library API that can be extended.** The API addresses a library as a **container resource with its own id**, looked up by `(space, theatre)`. It does not treat a library as an attribute of a theatre, and it addresses entries by UUID inside their container. Plans reference library entries by UUID only (`libraryRefs`) and never name a library. This keeps open the two future shapes without breaking references or URLs:
  - several libraries per space and theatre;
  - a hierarchical library (e.g. *All SAMs*, *All factories*).

  Recorded as a new architecture decision, **AD-17**.
- **The signed-in performance-profile spec gets implemented.** That spec was written ahead of time in `extract-performance-profiles`. It covers create/rename/delete, the per-plan profile chooser (`profileId` on the plan's Y.Doc), and the split between the profile being edited and the profile the plan flies. Two rules in it change for offline last-write-wins:
  - **Ids are generated on the device** instead of being assigned by the server, matching AD-16 and library UUIDs.
  - **Profile names are no longer unique.** An offline rename cannot be rejected after the fact; this follows the same reasoning as `unify-plan-name` for plan names.
- **Profile deletion is allowed even when plans use the profile.** Any plan whose `profileId` no longer resolves falls back to the null profile. This is already the spec's rule. AD-7's block-while-referenced rule waits for `add-trash-and-soft-delete`.
- **The anonymous tier is unchanged.** It keeps one device-local library per theatre and one device-local profile in localStorage, exactly as today, with no server traffic. This change neither carries out nor reverses AD-9's gating of the library behind an account. The gating stays a stated intention that hasn't been implemented, as the `theatre-library` tier note already says. `add-local-data-import` is the change that has to settle it, because that change decides whether a local library is imported at sign-in.

## Capabilities

### New Capabilities

- `space-asset-sync`: how the space-owned library and profiles persist and spread for signed-in users. It covers:
  - server persistence;
  - last-write-wins per entry and per profile, across a user's devices;
  - the local cache and the offline edit queue (the connectivity axis);
  - clearing the cache on logout;
  - creating never overwrites: a create for an id the server already holds adopts the server's copy, so an import on a device that is behind can't overwrite library entries.

  The anonymous tier is stated as local-only, with no sync. This is the last-write-wins counterpart of `plan-sync`, kept separate because the two sync models differ (AD-6).

### Modified Capabilities

- `space`: a space now holds the library and the profiles, not only plans. The space contains a flat list of profiles and exactly one library per theatre. The purpose text's "scoping of libraries and profiles is deferred" is resolved.
- `theatre-library`:
  - Persistence becomes tier-dependent: the signed-in tier uses the space's synced library and the anonymous tier uses localStorage.
  - The tier-position note is updated only to point the open gating question at `add-local-data-import`. The anonymous behaviour does not change.
  - Deleting an entry that other plans in the space reference leaves their references in place; those plans show a missing-object placeholder (`map-objects`). The delete confirmation still covers the active plan.
- `map-objects`: adds the **missing-object placeholder** that AD-4 and AD-7 assume but the app never had. A library ref whose entry is not in the library is listed in the Objects tab as a placeholder card instead of disappearing. The card shows the per-plan comment and one of two states:
  - **deleted**: the entry is known to be gone; offers *Remove from plan*;
  - **not synced yet**: the device is disconnected or still syncing; neutral, no removal, and it resolves by itself when the entry arrives.

  Unresolved refs are still not drawn on the map or the kneeboard, because a ref stores no position. Opening a plan never removes them.
- `map-objects` (import merge): the plan-import summary also reports how many *kept* entries differ from the file, and says the plan shows the library's version of them. In the signed-in tier, an entry the server already holds is kept even when the device was behind.
- `performance-profile`:
  - Signed-in ids are generated on the device instead of by the server.
  - The rule that names are unique within the collection is dropped.
  - Signed-in profile storage is defined by `space-asset-sync`.
  - Deletion with several plans: plans that reference the deleted profile and are not open fall back to the null profile.
  - The per-plan profile chooser is the only dropdown, in the Performance page header; the space's profiles are a sidebar list, and regimes are chips (design D10a).
  - Profiles have no name: they are labelled from the aircraft and take-off configuration.
  - Switching profiles clears only legs bound to the current profile. Orphan bindings are left alone, so they can resolve again in the new profile.
- `user-identity`: a device remembers the last signed-in user. Opening the app while offline starts in that user's signed-in tier, marked as disconnected, instead of falling back to anonymous; the session is re-checked on reconnect. Without this, offline editing only works when the connection drops after load. This applies to plans too (`plan-sync` already promises offline access to opened plans), so the space's plan list is also cached on the device.
- `aircraft-performance`: the performance file no longer carries a profile name (an old one is ignored), and the page groups taxi fuel and take-off under *General performance*, on its own line.
- `performance-regime`: in the signed-in tier, a leg's `regimeId` that does not resolve is no longer cleared on load. The leg computes as Manual until the regime is available. Otherwise, a plan opened before its profile has synced would erase every leg's regime binding, and that erasure would sync to all devices. The anonymous tier keeps clearing orphans on load.

## Impact

**Backend (`packages/backend`).**
- A new yoyo migration (AD-13) adds:
  - a `libraries` table, `(id, space_id, theatre)`, unique on `(space_id, theatre)` for now. The uniqueness is a constraint that can be dropped later, not part of the key.
  - a `library_entries` table, one row per entry, with its UUID, payload and LWW timestamp. Deleted entries are kept as tombstones, so that an offline device cannot bring them back.
  - a `profiles` table with the same per-row LWW columns and tombstones.
- New REST routes scoped to the session's space:
  - list and resolve libraries (by theatre);
  - read, write and delete library entries;
  - read, write and delete profiles;
  - fetch changes since a cursor, so offline devices can catch up.

  The route and payload shape is decided in `design.md` under AD-17.
- Authorization works as for plans: session user → Personal space → space ownership check.

**Frontend (`packages/frontend`).**
- `libraryStorage.ts` and `performanceStorage.ts` split by tier. Anonymous keeps the current localStorage keys. Signed-in gets a per-space local cache, an outgoing write queue and a sync client.
- New: profile collection UI on the Performance page, a per-plan profile chooser, and `profileId` in the plan's Y.Doc binding (`yjsFlightPlanBinding.ts`).
- Kneeboard generation resolves the profile from the synced collection for signed-in plans. The wire format is unchanged since `add-cloud-sync`.

**Docs.** New AD-17 in `docs/architecture/centralized-flightplans.md`, and the decision map is updated. AD-9 is not edited.

## Non-goals

- **Importing local data at sign-in (AD-8).** This is deferred to `add-local-data-import`. A signed-in user's existing localStorage library and profile are left untouched on the device but are not shown while signed in; the server collections start empty. Exporting and importing JSON files by hand still works as a bridge. The existing `performance-profile` *Sign-in adoption* requirement stays unimplemented until that change.
- **Gating the anonymous library behind an account (AD-9).** This change neither does it nor reverses it. It is left for `add-local-data-import` to decide.
- **Several libraries per theatre, or a hierarchical library.** Only the API's room to grow is in scope. Every space and theatre has exactly one library.
- **Blocking deletion of a referenced profile, soft delete and trash (AD-7).** Deferred to `add-trash-and-soft-delete`. The tombstones here exist only for sync correctness. They are not a user-visible trash.
- **Version history for libraries and profiles (AD-3, AD-4).** Deferred to `add-version-history`. That includes the placeholder's *recover into the library* action, which needs the copies pinned with each version.
- **Drawing missing objects on the map.** This would need a last-known copy of the object stored in each ref, which blurs AD-3's reference/snapshot split. Not planned.
- **Yjs or real-time collaboration for the library or profiles.** These stay last-write-wins, per AD-6. There is no push channel either: devices pick up changes by pulling (on load, on focus or reconnect, and periodically). The exact pull triggers are decided in design.
- **Squadron spaces, sharing (AD-10) and change awareness ("changed since").** These come in later changes.
