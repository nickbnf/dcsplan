## Context

See `proposal.md` — Why. What the code actually does today:

- **Theatre selection is a plan mutation.** `TitleZone` renders a theatre dropdown whose `onTheatreChange` reaches `Sidebar.handleTheatreSelect`: with an empty plan and library it silently rebuilds the plan on the new theatre; otherwise it opens `ChangeTheatreDialog`, and confirming calls `clearLibrary()` then `newFlightPlan(theatreId)`.
- **Per-theatre persistence already works.** `LibraryContext` loads the library for `flightPlan.theatre` and reloads whenever that changes (`:23-26`), persisting under a per-theatre key (`:29-31`). Nothing about persistence is missing — the single `clearLibrary()` call is what destroys data.
- **`clearAll` has exactly one consumer:** that destructive path (`Sidebar.tsx:60`). No UI anywhere lets a user deliberately clear a theatre library, so the only way to lose one today is the accident this change removes.
- **`newFlightPlan(theatre)` already exists** (`flightPlanUtils.ts:22`) and is what the theatre switch already calls.
- **`replaceFlightPlan` already exists**, from `add-edit-undo`: writes the plan without capturing undo, and discards the history (AD-12).

So the mechanism is almost entirely in place. This change is mostly deletion plus one new dialog.

## Goals / Non-Goals

**Goals:**
- One coherent way to start a plan, replacing two overlapping dialogs.
- Theatre chosen once, at creation, and immutable after (#20).
- A theatre's library survives forever, whatever else the user does.

**Non-Goals:**
- Multiple plans, a plan list, or plan naming — those arrive with `add-cloud-sync`.
- A deliberate "clear this library" action. Under AD-7 that wants soft-delete and a trash, which is `add-trash-and-soft-delete`'s job, not a like-for-like replacement of an accident.
- Any change to what a plan contains.

## Decisions

### D1 — One entry point, replacing both dialogs

A single **New flight plan** action opens a dialog carrying a theatre picker and a confirm. It takes the action-row slot where **Clear** sits today, and `ChangeTheatreDialog` and `ClearFlightPlanDialog` are both deleted.

*Why one and not two:* with theatre fixed at creation, "clear the plan" and "change theatre" collapse into the same operation — *start a fresh plan, on a theatre you pick*. Keeping both would leave two buttons whose only difference is whether the theatre field happens to change.

### D2 — Theatre becomes an input to creation, not a plan setting

The `TitleZone` dropdown becomes a **static label** showing the current plan's theatre. The picker moves inside the New flight plan dialog.

*Why not keep the dropdown as the entry point:* a control that looks like a setting but silently discards the current plan is exactly the trap that produced the data loss. Selection and creation should not look alike.

*Default in the dialog:* the current plan's theatre, since flying the same map again is the common case.

### D3 — Tier behaviour is one branch, not two flows

Creating a plan means:

| Tier | Behaviour |
|---|---|
| **Anonymous** (single plan, AD-9) | **replaces** the current plan |
| **Signed in** (multiple plans) | **appends** to the space's plan list; nothing is lost |

Only the anonymous branch is built here, because accounts do not exist yet — but both are specified, per the tier rule in `openspec/config.yaml`, so the account path is defined rather than inferred when `add-user-accounts` lands. Structure the flow so the tier difference is this single branch and not two parallel implementations.

### D4 — Confirm only when something would actually be lost

The confirmation appears only when creating the plan is destructive **and** there is something to destroy — i.e. the anonymous tier with a non-empty current plan. An empty plan is replaced silently, and in the signed-in tier there is nothing to confirm at all.

The confirmation text names only the plan. It must **not** mention the library, which is no longer affected.

### D5 — Libraries are never touched, and `clearAll` goes

The `clearLibrary()` call is deleted. Nothing replaces it: `LibraryContext` already loads the new theatre's library and leaves the old one on disk, so "build a Caucasus library, fly Syria, come back, it's intact" works the moment the call is gone.

`LibraryContext.clearAll` then has no consumer and is **removed** rather than left available. Leaving a destructive no-caller method invites re-wiring it into exactly the path being removed here; a deliberate clear can be reintroduced with AD-7 semantics when something actually needs it.

### D6 — Fix the per-theatre persist race, because this change is what makes it matter

`LibraryContext` runs two effects keyed on `theatre`: one reloads entries for the new theatre, one persists the current entries under the current theatre. On the commit where theatre goes A → B, the persist effect still sees **A's entries** alongside **B's theatre**, and writes A's library into B's key. The subsequent re-render corrects it, so it self-heals — but a reload landing between the two writes leaves B's library holding A's contents.

Today this is masked: the outgoing library was being wiped anyway, so nobody noticed. Once libraries are meant to survive, a path that can overwrite one theatre's library with another's is half a fix.

**The invariant to enforce:** entries are never persisted under a theatre they were not loaded for. Holding theatre and entries as a single state value, and persisting only when they agree, satisfies it; the mechanism is an implementation detail.

### D7 — Creating a plan reuses the existing replace path

The new flow calls `replaceFlightPlan`, so it is not undoable and clears the undo history (AD-12). No new mechanism, and the exclusion it needs already exists.

When `add-version-history` lands, this operation also forces a version to be finalized first (AD-5), making the replaced plan recoverable.

## Risks / Trade-offs

- **Users lose the ability to retheatre a plan in place** → intended (#20); the replacement is one extra click and no longer costs them their library. Worth watching for anyone who used it deliberately rather than as the only available route.
- **Libraries already destroyed by the current behaviour stay destroyed** → nothing can recover them; this only stops further loss. An argument for shipping promptly.
- **No way to clear a library at all after D5** → accepted. There was no deliberate way before either, and AD-7 defines what a real one should look like.
- **The static theatre label may read as a disabled control** → present it as plan metadata rather than a greyed-out dropdown, so it does not look broken.
- **D6 touches code this change otherwise only deletes from** → confined to `LibraryContext`'s two effects, covered by a test that switches theatre and asserts both libraries survive intact.

## Migration Plan

None. Stored plans already carry a theatre and are unaffected; no key or schema changes. Deploy is a normal frontend release, rollback is reverting it.

Libraries stored under existing per-theatre keys are read unchanged — this change stops writing to them destructively, it does not reshape them.

## Open Questions

- Whether the New flight plan dialog should also take a plan name. It is free to add, but naming only becomes meaningful when a plan list exists, so it likely belongs with `add-cloud-sync`.
- Where the New action sits once a plan list exists — the action row is right for a single-plan app, a list header may be better later. Does not affect this change's specs.
