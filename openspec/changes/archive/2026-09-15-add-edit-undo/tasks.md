## 1. Undo history core

- [x] 1.1 Add an undo-history module in `packages/frontend/src/hooks/` exposing push / undo / redo / clear, plus `canUndo` and `canRedo`, holding entries as `{ before, coalesceKey?, at }`; verify it type-checks with `pnpm --filter frontend build`
- [x] 1.2 Implement linear undo and redo over the stack, with any new push discarding the redo side; verify with unit tests covering repeated undo, redo after undo, and redo cleared by a new push (spec: *Undo and redo of flight plan edits*)
- [x] 1.3 Implement bounded retention that drops the oldest entry past the limit (≥ 20, default 50); verify with a unit test that pushes limit + 5 entries and asserts the earliest are unreachable (spec: *history is bounded*)
- [x] 1.4 Implement coalescing: a push whose `coalesceKey` matches the previous entry's within the idle window merges into it instead of pushing; verify with unit tests for continuous same-key pushes collapsing to one entry, same key after the window staying distinct, and differing keys staying distinct (design D3)
- [x] 1.5 Confirm the whole module is covered by `pnpm --filter frontend test` with no other code wired in yet

## 2. Capture inside the flight plan context

- [x] 2.1 Hold the history in `FlightPlanContext` and capture the pre-edit plan from inside `handleFlightPlanUpdate`, reusing its existing substantive-change check so no-op updates create no entry; verify with a test that re-submitting an identical plan leaves `canUndo` false (spec: *an update that changes nothing creates no entry*)
- [x] 2.2 Expose `undo`, `redo`, `canUndo`, `canRedo` on the context value; verify consumers can read them in a rendering test
- [x] 2.3 Add a distinct replace entry point on the context that writes the plan **without** capturing and **clears both** the undo and redo history; verify with a test that history is empty after it runs (design D5)
- [x] 2.4 Verify undo and redo write through the normal persistence path by asserting the restored plan reaches storage after the debounce (spec: *an undone state is persisted like any other edit*)

## 3. Wire the existing controls

- [x] 3.1 Replace the `onUndo`/`onRedo` no-ops in `PlannerApp.tsx:65-66` with the context's handlers; verify clicking Undo in the sidebar reverses the last edit
- [x] 3.2 Thread `canUndo`/`canRedo` through `Sidebar` to `ButtonZone` and render both buttons disabled when unavailable; verify with a test asserting both are disabled on a freshly loaded plan and Undo enables after one edit (spec: *controls reflect availability*)

## 4. Keyboard shortcuts

- [x] 4.1 Register a single `keydown` handler above the pages — not inside `Map.tsx` or `LibraryMap.tsx`, which own their own listeners — binding `Ctrl/Cmd+Z` to undo and `Ctrl/Cmd+Shift+Z` and `Ctrl+Y` to redo; verify each binding triggers the same result as the corresponding button (spec: *both redo bindings are accepted*)
- [x] 4.2 Ignore the shortcuts when the event target is an `input`, `textarea`, or contenteditable, leaving plan and history untouched; verify with a test that `Ctrl+Z` inside a focused waypoint comment textarea does not change the plan (spec: *shortcut ignored while editing a text field*)
- [x] 4.3 Ignore the shortcuts while coord entry mode is active; verify with a test that coord entry stays open and the plan is unchanged (spec: *shortcut ignored during coord entry*)
- [x] 4.4 Verify no regression in the existing global handlers: `+`/`-` selection cycling, Escape, and coord entry still behave per the `waypoint-selection` and `waypoint-coordinate-edit` specs

## 5. Coalescing for the continuous controls

- [x] 5.1 Pass a stable coalesce key from the declination and bank-angle sliders in `ButtonZone`; verify a continuous slider drag is reversed by a single undo (spec: *dragging a slider produces one entry*)
- [x] 5.2 Verify a drag, a pause past the idle window, then a second drag produce two separately undoable entries (spec: *separate interactions with the same control stay distinct*)
- [x] 5.3 Verify drags need no key: dragging a waypoint and dragging a plan marker each yield exactly one entry, since both write only on `modifyend` (spec: *dragging a waypoint produces one entry*)

## 6. Wholesale-replacement opt-outs

- [x] 6.1 Route flight plan import through the replace entry point from 2.3; verify undo is unavailable after an import and no pre-import state is reachable (spec: *import is not undoable*, *import discards history from before it*)
- [x] 6.2 Route Clear flight plan through the replace entry point; verify the plan stays cleared after invoking undo (spec: *clearing the flight plan is not undoable*)
- [x] 6.3 Route Change theatre through the replace entry point; verify undo does not restore the previous theatre's plan
- [x] 6.4 Audit every remaining caller of the plan update path for anything that replaces rather than edits, and verify by listing the call sites that each is intentionally undoable

## 7. Cross-page behaviour

- [x] 7.1 Verify an edit made on the attack planning page is reversible after navigating to the planner (spec: *an edit made on another page is undoable*)
- [x] 7.2 Verify editing a theatre library entry is not reversed by flight plan undo (spec: *library edits are not reversed by flight plan undo*)

## 8. Full verification

- [x] 8.1 Run `pnpm --filter frontend test` and confirm the suite passes with no pre-existing tests broken
- [x] 8.2 Run `pnpm --filter frontend build` and confirm a clean type-check
- [x] 8.3 Run `openspec validate add-edit-undo --type change --strict` and confirm it passes
- [x] 8.4 Exercise the app manually: edit, undo, redo, reload and confirm history is empty while the edit persists (spec: *history does not survive a reload*)

## 9. Optional polish — not required by the spec

- [ ] 9.1 Attach a short label to entries produced by the destructive actions (delete waypoint, delete marker) and surface it when an undo reverts a change originating on a different page; verify the label appears when undoing across pages (design: cross-page risk mitigation)
