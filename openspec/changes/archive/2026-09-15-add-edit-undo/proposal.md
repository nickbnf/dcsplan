## Why

The app renders **Undo and Redo buttons that do nothing**. They are wired to `() => {}` (`components/sidebar/ButtonZone.tsx:97-98`, `components/PlannerApp.tsx:65-66`) and have shipped that way. A visible control that silently does nothing is worse than no control at all — a user who nudges a waypoint two miles by accident clicks Undo, sees no change, and has no way back.

Nothing else in the app covers this. Version history (`add-version-history`) is a different mechanism at a different granularity and cannot substitute for it (AD-12): it coalesces to roughly one version per editing session, so restoring always overshoots a single mis-drag by a whole sitting.

This is entirely client-side and depends on nothing, so it ships **before** `extract-performance-profiles` — which then inherits undo for its destructive profile switch instead of documenting a recovery gap.

## What Changes

- **An undo/redo stack per entity** — plan, library, profile — capturing the working copy before each user action, mirroring the three independent histories of AD-4. This change implements the **plan** stack only; the other two are a mechanical repeat once the mechanism exists (design.md, D1–D2).
- **The existing Undo/Redo buttons are wired up** and reflect real state: disabled when their stack is empty.
- **Keyboard shortcuts** — `Ctrl+Z` / `Cmd+Z` and `Ctrl+Shift+Z` / `Cmd+Shift+Z` (plus `Ctrl+Y`), suppressed while a text input has focus so native field undo still works.
- **Actions are coalesced to one stack entry each.** Drags already write once, on `modifyend`, so they need nothing; the continuous inputs are the declination and bank-angle sliders, which fire per step.
- **The stack is in-memory and session-scoped** — discarded on reload. Durable recovery is `add-version-history`'s job, not this one.
- **Bounded depth** so a long session can't grow the stack without limit.
- **Wholesale-replacement operations are not undoable, and they clear the stacks.** Import, Clear flight plan, and Change theatre replace the working set outright; import in particular writes plan, library, and performance together, which no per-surface stack can reverse (AD-12). Each keeps its existing confirmation dialog as its guard. Clearing rather than skipping is the point — stale entries would let Undo resurrect a replaced plan. (Clear and Change theatre are slated to merge into a single "New flight plan" flow; this change treats whichever dialogs exist when it lands.)

## Capabilities

### New Capabilities
- `edit-undo`: the undo/redo model — what constitutes one undoable action, per-surface stack scoping, stack depth and lifetime, redo invalidation on a new action, button and keyboard affordances, and which operations are undoable versus deliberately excluded.

### Modified Capabilities

None. This adds a new capability around existing editing behaviour; no existing requirement changes. The `map-objects`, `theatre-library`, and `aircraft-performance` specs describe *what* their edits do, which is unaffected by those edits becoming reversible.

## Non-goals

- **No durable history.** The stack dies on reload. Cross-session recovery is `add-version-history` (AD-12).
- **No inverse-operation (command pattern) undo.** Snapshot-based, per AD-12 — the concurrency hazard that would justify the extra cost doesn't exist until `add-cloud-sync`.
- **No cross-surface undo.** Undoing on the planner never reaches into the library or performance page, and vice versa.
- **No collaborative/multi-user semantics.** There is no server yet. AD-12 records the forward rule — a remote edit discards the local stack — but nothing implements it here.
- **No change to what any edit does**, only to whether it can be taken back.

## Impact

**Wiring that already exists** — `PlannerApp.tsx:65-66` supplies the no-op handlers; `Sidebar.tsx:22-23,40-41,94-95` threads them; `ButtonZone.tsx:8-9,22-23,97-98` renders the buttons. The props are in place; only real implementations and disabled-state are missing.

**Planner surface** — plan mutations flow through `onFlightPlanUpdate`, which is the natural capture point. Drag interactions in `components/Map.tsx` need an explicit commit-on-end so a drag is one entry rather than hundreds.

**Library surface** — `components/LibraryMap.tsx` has its own map, its own edits, and its own `keydown` handler (`LibraryMap.tsx:336-337`), which must not collide with the new shortcuts.

**Performance surface** — `contexts/PerformanceContext.tsx` mutates through `setPerformance`/`updateAircraft`/regime CRUD; `PerformancePage.tsx` is the surface.

**Keyboard** — `Map.tsx:609,741-742` already installs a global `keydown` handler for selection cycling, Escape, and coordinate entry. The undo shortcuts must integrate with it rather than register a competing listener.

**Storage** — none. The stack never touches localStorage.

**Forward dependency:** once `add-version-history` lands, the three excluded operations each force a server-side version to be finalized *before* they apply (AD-5), so what the undo stack deliberately won't recover, history will. Nothing in this change implements that; it is recorded so the exclusion reads as a division of labour rather than a hole.
