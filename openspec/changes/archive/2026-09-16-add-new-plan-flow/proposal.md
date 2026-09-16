## Why

The app lets a user change a plan's theatre, which exists only as a workaround for supporting a single plan — with one plan, switching its theatre is the only way to fly somewhere else. It carries two problems:

1. **It destroys data.** Confirming a theatre change calls `clearLibrary()` on the *outgoing* theatre (`Sidebar.tsx:73-75`), permanently deleting the library the user built there. Switch Caucasus → Syria and a carefully-assembled Caucasus threat library is gone, with the only warning being a sentence in a confirmation dialog. Destroying a persistent, per-theatre asset as a side effect of switching is exactly what AD-7 forbids.
2. **It breaks plan references.** A plan's `libraryRefs` point into its theatre's library. Changing the theatre orphans every one of them, which is why #20 fixes theatre at plan creation.

The spec already contradicts itself here: *Theatre-scoped library persistence* says libraries are partitioned per theatre and survive, while *Theatre change confirmation mentions the library* says the outgoing one is blanked. Both cannot be true. The code implements the destructive reading, which makes the persistence scenarios only accidentally pass — a user never returns to a non-empty library.

The replacement is a **New flight plan** flow that picks a theatre at creation. It subsumes Change theatre and Clear flight plan, works in both tiers, and needs no server.

## What Changes

- **New flight plan flow** with a theatre picker at creation. Theatre is chosen once and is immutable thereafter (#20).
- **Tier-appropriate semantics** — in the anonymous single-plan tier (AD-9) creating a plan **replaces** the current one, behind a confirmation. With an account and multiple plans it simply **appends**, and is not destructive at all.
- **`ChangeTheatreDialog` is removed.** Its role is gone.
- **`ClearFlightPlanDialog` is removed**, subsumed by "new plan" — clearing a plan and starting a fresh one are the same operation with the same guard.
- **Libraries are never blanked as a side effect.** The per-theatre partitioning becomes true as written: build a Caucasus library, fly Syria, come back, and the Caucasus library is intact.
- **Where the new plan's library comes from, per tier:**
  - **Signed in** — the active space's library for the chosen theatre is loaded (AD-1). A squadron's Syria intel is there the moment a Syria plan is created, without anyone importing anything.
  - **Anonymous** — no fetch and no prompt. Whatever is already in local per-theatre storage for that theatre is used, which is usually nothing, and an empty library is a normal starting state rather than an error. Importing a library file remains the way to populate it.
- **BREAKING (behaviour):** users lose the ability to retheatre an existing plan. The replacement path is creating a new plan — which no longer costs them their library.

## Capabilities

### New Capabilities
- `plan-lifecycle`: creating a flight plan — theatre selection at creation, theatre immutability afterwards, and the replace-versus-append semantics that follow from how many plans the tier supports.

### Modified Capabilities
- `theatre-library`: **removes** the *Theatre change confirmation mentions the library* requirement outright — there is no theatre change to confirm. *Theatre-scoped library persistence* is strengthened to state that a theatre's library is never destroyed as a side effect of another operation, resolving the existing contradiction between the two.

## Non-goals

- **No multi-plan support.** This defines what creating a plan *means* in each tier; actually holding several plans arrives with `add-cloud-sync` (AD-9 keeps the anonymous tier at one).
- **No plan list, naming, or switching UI.** Same reason.
- **No library management changes** beyond ceasing to destroy libraries. Soft-delete, trash, and referenced-object rules are AD-7's, in `add-trash-and-soft-delete`.
- **No migration.** Existing stored plans already carry a theatre; nothing about them changes.
- **No recovery for libraries already destroyed** by the current behaviour. They are gone; this stops the bleeding.

## Impact

**Removed** — `components/sidebar/ChangeTheatreDialog.tsx`, `components/sidebar/ClearFlightPlanDialog.tsx`.

**`components/Sidebar.tsx`** — carries the whole mechanism: `pendingTheatreId` state (`:56`), the confirm handler that calls `clearLibrary()` and rebuilds the plan (`:73-79`), the dialog render (`:168-172`), and the `useLibrary().clearAll` binding (`:53`). All of it goes.

**`utils/flightPlanUtils.ts`** — `newFlightPlan(theatre)` (`:22`) already exists and is what the theatre switch calls today; the new flow reuses it directly rather than introducing a new primitive.

**`contexts/LibraryContext.tsx`** — `clearAll` (`:52`) loses its only caller in this path. It stays for explicit user-initiated library clearing, but must no longer be reachable from plan creation.

**Theatre selection UI** — currently a switcher acting on the live plan; becomes an input to plan creation.

**Interaction with `add-edit-undo`** — "new plan" is a wholesale-replacement operation: not undoable, and it clears the undo stacks (AD-12). Whichever of the two lands second wires this up.

**Interaction with `add-version-history`** — when it lands, creating a plan in the single-plan tier forces a version to be finalized first (AD-5), so the replaced plan stays recoverable.
