# Proposal

## Why

A signed-in user can't delete a plan at all today, so the Flight Plans list only grows. Library entries and profiles can be deleted, but those deletions can't be undone. Their sync tombstones throw the data away (`add-library-profile-sync` kept them "for sync correctness only, not a user-visible trash"). Deleting a profile or library entry also edits the open plan: it clears the profile and its leg bindings, or removes the reference. So even if the item came back, the plan the user was working on would stay damaged. AD-7 settled that deletion is soft, goes to a space-level trash that an admin can restore from, and that references are checked when something is deleted. Several earlier changes deferred these rules to this one (`add-new-plan-flow`, `add-cloud-sync`, `add-library-profile-sync`). Now that plans, libraries and profiles all live server-side, this is the change that delivers them.

## What Changes

- **Plan deletion (signed-in).** The plan list offers *Delete* on each plan, with a confirmation. A deleted plan leaves the list right away, can no longer be opened at its address, and goes to the space's trash. A device that has the plan open falls back to the plan list (`space`'s existing unresolvable-plan rule).
- **A space-level Trash.** The plan list links to a Trash view. It lists deleted plans, library entries and profiles, each with the date it was deleted, and offers *Restore*. A restored item comes back exactly as it was when deleted, under the same id. Restore is restricted to the space's admin, which is the owner in a Personal space (AD-1).
- **Trashing never edits a plan.** Deleting a profile or library entry leaves every plan's references exactly as they were, including the open plan's: its `profileId`, its per-leg regime bindings and its library refs. While the item is in the trash, those references are unresolved:
  - a plan whose profile is trashed computes its bound legs as Manual and says its profile was deleted;
  - a trashed library entry shows the existing missing-object placeholder (`map-objects`).

  Restoring the item therefore brings every plan back to how it was, with nothing to repair. **BREAKING (behaviour):** today, deleting the flown profile clears the open plan's bindings, and deleting a library entry removes the open plan's reference. Neither happens any more.
- **Deletion warns, it does not block.** The confirmation for a profile or library entry states how many live plans in the space reference it ("flown by N plans" or "used by N plans"). The server counts these at the moment of deletion by reading the space's plan documents. There is no persistent reference index. Without a connection the count isn't available, and the dialog says other plans could not be checked. **This amends AD-7**, which says to block profile deletion while plans reference it. Because trashing is now fully reversible and leaves plans untouched, a warning is enough.
- **Retention and purge.** Trashed items are purged automatically about 30 days after deletion (AD-7). A purged plan's document and update log are removed. A purged library entry or profile becomes a bare sync tombstone, so the sync rule that deletions win still holds. References to it stay unresolved for good.
- **Tombstones keep their data while trashed.** Deleted library entries and profiles keep their content on the server until they are purged, so they can be restored.

## Capabilities

### New Capabilities
- `soft-delete`: what deleting a space-owned plan, library entry or profile means, with the trash, restore by the space admin, retention and purge, and the rule that trashing never edits a plan (AD-7, as amended). It is the home for squadron and account deletion rules when those arrive.

### Modified Capabilities
- `space`: the plan list offers plan deletion and links to the Trash. Deleted plans are excluded from the list and from address resolution.
- `theatre-library`: library entry deletion moves the entry to the trash and no longer removes the open plan's reference. The confirmation states how many plans in the space reference the entry.
- `performance-profile`: profile deletion moves the profile to the trash, warns with the number of plans that fly it, and no longer clears the open plan's profile or bindings. A plan whose profile is trashed or purged shows that state and offers to choose another profile.
- `map-objects`: a placeholder for a trashed entry resolves again when the entry is restored.
- `space-asset-sync`: restoring from the trash brings an entry or profile back on every device. While trashed, an entry or profile keeps its data on the server.
- `plan-sync`: a plan deleted on another device stops syncing, and the open device leaves it. Offline edits to a deleted plan don't bring it back.

## Impact

- **Backend:** a migration (`plans.purged_at`), entry and profile tombstones that keep their data until purged, plan delete and restore endpoints, trash listing, restore for entries and profiles, a count of references to an entry or profile computed by reading the space's plan documents, a periodic purge job in the app lifespan, and the sync WebSocket refusing deleted plans. Touches `plans.py`, `assets.py`, `spaces.py`, `space_routes.py`, `asset_routes.py`, `sync.py`, `main.py`.
- **Frontend:**
  - the plan list's *Delete* action, and a Trash view with its route;
  - the library and profile delete dialogs, which show the reference count and stop editing the plan;
  - a plan whose profile is in the trash, and a plan deleted while it is open.
- **Specs:** new `soft-delete`; deltas to `space`, `theatre-library`, `performance-profile`, `map-objects`, `space-asset-sync`, `plan-sync`.
- **Docs:** amend AD-7 in `docs/architecture/centralized-flightplans.md`. Profile deletion becomes warn and trash rather than block, and trashing never edits plans. Update the AD table row.

## Non-goals

- **Squadron and account deletion** (AD-7 rows 4–5). Squadron spaces don't exist yet. This change covers the Personal space, with roles written so that squadron admin/member rules can slot in.
- **The anonymous tier.** It has a single plan and a device-local library and profile (AD-9). Its deletion behaviour is unchanged and it has no trash.
- **A persistent server-side reference index.** Counting references when something is deleted is enough for a Personal space. Squadron-sized spaces can switch to an index behind the same function.
- **Manual purge ("Empty trash", "Delete permanently").** Items leave the trash only by being restored or by the automatic purge.
- **Version-history interaction.** Pinned snapshots (AD-3) don't exist yet. Restoring a plan brings back its working copy only.
- **Export offered at deletion time.** AD-7 requires export only for squadron deletion.
