# Proposal

## Why

Signing in currently strands a user's local work. Their anonymous plan, library and profile stay on the device but are hidden while signed in, and the only way into the account is to export JSON files and import them again by hand. `add-cloud-sync` and `add-library-profile-sync` both deferred this to here (AD-8).

The manual import also no longer fits the signed-in tier. It sits inside a plan's sidebar and **replaces** the open plan, even though a signed-in space holds many plans. It also always merges everything the file carries.

## What Changes

**Sign-in import of local data (AD-8).**
- On sign-in, the device's anonymous data is offered for import into the Personal space: the plan, the library (every theatre held on the device) and the profile.
- An **empty account** imports it silently.
- An **account that already holds data** sees the import chooser described below, with *Not now* to keep everything on the device. The offer stays reachable afterwards from `/plans` while un-imported local data remains, so a user who declined, or who signed in before this change, can still import later.
- Every import adds and never overwrites. The plan is appended with a new id (AD-16). Library entries merge by UUID (AD-17). The profile is added, or reused if its id is already in the space. Duplicates across devices are accepted, as AD-8 states.

**Import moves local data instead of copying it.** Once an imported item reaches the server, it is removed from the device's anonymous store:
- an imported plan resets the anonymous plan to a fresh one;
- imported library entries leave the local library;
- an imported profile resets the local profile to its bootstrap state.

Items left unticked stay local. **Logout is otherwise unchanged:** synced caches are cleared and the remaining anonymous data is kept. This narrows AD-8's "logout clears the device", and nothing un-imported is ever lost.

**Manual plan import moves to `/plans` for signed-in users.**
- A signed-in user imports a plan file from the Flight Plans home (`/plans`), not from inside a plan.
- The import **adds a new plan** to the space with a new id, takes its theatre from the file, and opens it. It never replaces an existing plan. **BREAKING** for signed-in users: the in-plan *Replace flight plan* import goes away.
- The anonymous tier keeps its import in the plan sidebar, which still replaces the single plan.

**The import chooser.** In both tiers, and at sign-in, the import lists what the source holds, each with its own checkbox:
- **Flight plan.** Always included in a file import.
- **Library entries.** For a file, the entries the plan references; for sign-in, the local library. The count is split into *already in your library* and *new*.
- **Performance profile.** Shown as new to the space or already present.

All boxes are ticked by default. Items the space already holds are reused whether or not their box is ticked. Unticking only skips items the space does not have yet: the plan then shows those library refs as deleted placeholders (`map-objects`), and resolves to the null profile if its profile is missing (`performance-profile`). The dialog says so before import.

**Export and import are de-emphasized for signed-in users.**
- With sync and multiple plans, files are no longer the main way to move or keep plans.
- In the signed-in plan sidebar, Export moves from a primary button to a secondary control. Design decides the exact placement.
- The anonymous sidebar keeps its current buttons.

**The anonymous library stays (AD-9 amended).**
- Anonymous users keep their device-local per-theatre library. The gating that AD-9 intended is withdrawn.
- AD-9's tier list and its `map-objects` consequence are updated to match, and the open-gating note in `theatre-library` is closed.

## Capabilities

### New Capabilities
- `plan-import`: importing a flight-plan file, covering the per-item chooser and its defaults, where the import lives in each tier (sidebar for anonymous, `/plans` for signed-in), and replace versus add by tier. It also covers what a skipped library entry or profile means for the imported plan.
- `local-data-migration`: offering the device's anonymous data to an account. Covers silent import for an empty account and the chooser otherwise, *Not now* and the later entry point on `/plans`, additive merging, move semantics (local items removed once safely on the server), and what each tier sees afterwards.

### Modified Capabilities
- `performance-profile`: *Sign-in adoption* is replaced. The profile is adopted only if it is chosen for import (silently for an empty account), and the local profile resets once adopted. *Performance import is tier-branched* only refers its plan-import scenarios to `plan-import`; behaviour is unchanged.
- `map-objects`: *Library snapshot merge on plan import* only applies when library entries are ticked. In the signed-in tier, entries go to the space's library for the imported plan's theatre, which may differ from the active plan's theatre.
- `theatre-library`: the tier-position note is resolved, and the library stays available in both tiers. A requirement is added: library entries imported at sign-in leave the device-local library.
- `plan-sync`: *Logout clears synced plan caches but preserves the anonymous local plan* is reworded. The anonymous plan that is preserved is whatever remains after any import.
- `user-identity`: *Log out* preserves the anonymous data that remains on the device. That data may be less than before sign-in, because imported items have moved to the account.
- `space`: the Personal space's plan list (`/plans`) gains the import entry points: *Import plan file* and, when relevant, *Import local data from this device*.

## Impact

**Frontend (`packages/frontend`).**
- `components/sidebar/ImportFlightPlanDialog.tsx` becomes a shared import chooser with per-item selection. It is used from the anonymous sidebar, `PlansHomePage.tsx`, and the sign-in flow.
- `Sidebar.tsx` hides Import and demotes Export when signed in.
- A new sign-in migration flow sits next to `AuthContext.tsx`. It detects local data and whether the account is empty, uploads through the existing plan (`planApi.ts`, Yjs provider) and asset (`assetSync.ts`) paths, and clears local items only after the server acknowledges them.
- `libraryStorage.ts` and `performanceStorage.ts` gain removal and reset operations for the anonymous store.
- The anonymous plan's IndexedDB store is reset after its plan is imported.

**Backend.** `POST /plans` gains an optional `initialState` (a Yjs update), so a plan is created with its content in one acknowledged request (design D1). There are no new tables or migrations. An account's emptiness is derived from the existing plan and asset listings.

**Docs.**
- `docs/architecture/centralized-flightplans.md`: amend AD-8 (move semantics replace the logout device wipe; per-item chooser) and AD-9 (anonymous library kept). Update the decision map.
- `openspec/config.yaml`: the anonymous-tier vocabulary drops "the reusable object library … require an account".

## Non-goals

- **Content-level deduplication.** The same plan imported from two devices yields two plans (AD-8). Deletion arrives with `add-trash-and-soft-delete`.
- **Wiping the device on logout.** With move semantics, nothing left local has an account copy to fall back on, so it is kept.
- **Choosing individual library entries or theatres.** The chooser selects whole categories (plan, library entries, profile), not single entries.
- **Importing into a squadron space or choosing the target space.** Only the Personal space exists (AD-15). The squadrons change extends this.
- **Promoting plan-local markers into the library at sign-in.** AD-8 lists this as optional and it is not built here.
- **Changing the file formats.** The plan, library and `.perf.json` formats, and the standalone library and performance imports on their own pages, are unchanged.
- **Version history of imported data.** Imported items start with no history. `add-version-history` adds it.
