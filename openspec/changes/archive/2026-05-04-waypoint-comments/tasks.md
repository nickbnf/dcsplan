## 1. Data Model

- [x] 1.1 Add `comment?: string` to `FlightPlanTurnPoint` in `packages/frontend/src/types/flightPlan.ts`
- [x] 1.2 Add `comment?: string` to `FlightPlanPointChange` in `packages/frontend/src/types/flightPlan.ts`

## 2. Sidebar UI — Comment Icon

- [x] 2.1 Add a comment icon button to the `WaypointCard` header row (left of the delete button), using `opacity-0 group-hover:opacity-100` when no comment exists and always-visible `avio-primary` colour when a comment exists
- [x] 2.2 Wire the icon click to toggle a `isEditingComment` local state boolean

## 3. Sidebar UI — Inline Editor

- [x] 3.1 When `isEditingComment` is true, render a fixed-height (3 rows), non-resizable `<textarea>` at the bottom of the card, pre-filled with the current comment and auto-focused
- [x] 3.2 On blur or Enter: save the trimmed value via `flightPlanUtils.updateTurnPoint` (empty string clears the comment) and set `isEditingComment` to false
- [x] 3.3 On Escape: discard changes and set `isEditingComment` to false
- [x] 3.4 Cap textarea input at 150 characters (`maxLength={150}`)

## 4. Sidebar UI — Preview Line

- [x] 4.1 When a comment exists and `isEditingComment` is false, render a single truncated line at the bottom of the card (`truncate` class) that opens the editor on click
- [x] 4.2 Clicking the preview line sets `isEditingComment` to true (same as clicking the icon)

## 5. Backend — Kneeboard Rendering

- [x] 5.1 Add `comment: Optional[str]` to the `FlightPlanTurnPoint` Pydantic model in `packages/backend/flight_plan.py`
- [x] 5.2 In `map_annotations.py`, add a `draw_comment_strip()` function that draws a full-width semi-transparent text strip at the bottom of the kneeboard page, with word-wrap up to 2 lines and ellipsis truncation
- [x] 5.3 Call `draw_comment_strip()` from `generate_kneeboard_single_png()` in `kneeboard.py` when `dest_point.comment` is non-empty

## 6. Tests

- [x] 6.1 Add a backend test verifying that a kneeboard page generated for a leg whose destination has a comment includes the comment text (pixel-level or metadata check)
- [x] 6.2 Add a backend test verifying that a page for a leg with no comment does not call the comment strip (or renders identically without it)
- [x] 6.3 Verify existing frontend tests still pass after model changes
