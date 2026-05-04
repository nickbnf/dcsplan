## Context

The sidebar renders waypoints as `WaypointCard` components in `FlightPlanZone.tsx`. Each card already has a hover-reveal pattern for secondary controls (type selector fades in on `group-hover`). The flight plan data model is `FlightPlanTurnPoint` in `flightPlan.ts`.

The kneeboard is generated in Python (`kneeboard.py` + `map_annotations.py`). Each leg page is a 768×1024 PNG. A `draw_info_box()` function draws a semi-transparent box at the **bottom-left** corner showing destination waypoint name, coordinates, and EFR. The comment should appear at the bottom of the same page, as a separate element so it can span more width independently of the structured info box.

The flight plan is serialised as JSON (downloaded/uploaded), so any new field on `FlightPlanTurnPoint` must round-trip cleanly. The backend receives the same JSON via the API.

## Goals / Non-Goals

**Goals:**
- Let users attach a short free-text note (≤ ~150 chars) to any waypoint
- Zero sidebar footprint when no comment exists; minimal footprint (1 truncated line) when one does
- Render the comment at the bottom of the kneeboard page for that waypoint as destination
- Persist the comment in the flight plan JSON

**Non-Goals:**
- Formatted or multi-paragraph notes
- Comments on legs (only waypoints)
- Comment visible on the kneeboard overview page or waypoint list page

## Decisions

### 1. Data model: `comment?: string` on `FlightPlanTurnPoint`

Add an optional string field. No length enforcement in the model — the UI textarea can cap input at ~150 chars. Empty string and absence are treated identically (no comment). This keeps the backend simple: check `if dest_point.comment`.

**Alternative considered:** store comments in a parallel array on `FlightPlan`. Rejected — co-locating with the point is simpler and avoids index drift bugs.

### 2. Sidebar UX: ghost icon in header → inline textarea expand

The comment icon (pencil/note glyph) lives in the `WaypointCard` header row, to the left of the delete button. It follows the existing `opacity-0 group-hover:opacity-100` pattern when no comment exists. When a comment exists, the icon is always visible and rendered in `avio-primary` colour.

Clicking the icon (or the preview line) sets a local `isEditingComment` boolean, which renders a `<textarea>` at the bottom of the card. On blur or Enter the comment is saved; on Escape it is discarded. Clearing the text and saving removes the comment.

A single-line truncated preview (`overflow-hidden text-ellipsis whitespace-nowrap`) is shown at the bottom of the card when a comment exists and `isEditingComment` is false.

**Alternative considered:** popover. Rejected — inline expand avoids z-index and positioning complexity and is more consistent with the push-field expansion pattern already in the card.

### 3. Kneeboard rendering: comment box alongside the info box

The comment is drawn as a box to the **right** of the info box, vertically aligned with it (same `top` and `height`). The comment box spans from the right edge of the info box to the right margin, using all remaining width. It uses the same semi-transparent white background and `SMALL_FONT`.

`draw_info_box()` returns its geometry `(box_left, box_top, box_width, total_height)` so `draw_comment_strip()` can align precisely. Both are drawn in a single RGBA overlay pass in `kneeboard.py`.

If no info box is present (e.g. no detail keys requested), the comment strip falls back to a full-width strip at the bottom.

**Alternative considered:** full-width strip below the info box. Rejected — causes overlap with the info box and wastes vertical space; the side-by-side layout is cleaner and uses the space already reserved for the info box.

**Text wrapping:** pixel-accurate wrapping using `draw.textlength()` on candidate lines (avoids character-width estimation error). Text is vertically centred within the strip. Long comments are word-wrapped up to 2 lines then truncated with an ellipsis.

## Risks / Trade-offs

- **Existing flight plans:** Adding `comment` as optional means all existing JSON files remain valid without migration. Backend and frontend both treat absence as no comment.
- **Comment box width depends on info box width:** If the info box is wider than usual (long waypoint name) the comment box narrows. Given 150-char cap on comments and 768px page width this is unlikely to be a problem in practice.
- **Textarea UX on small sidebar:** The sidebar is narrow. A 2–3 row fixed-height `<textarea>` fits comfortably. `resize: none` prevents the user from expanding it and breaking the layout.
