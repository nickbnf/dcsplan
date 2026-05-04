## ADDED Requirements

### Requirement: Comment field on waypoint data model
The system SHALL support an optional `comment` string field on each flight plan turn point. Absence of the field and an empty string SHALL both be treated as no comment. The field SHALL be preserved through JSON serialisation and deserialisation without modification.

#### Scenario: Round-trip serialisation
- **WHEN** a flight plan containing a waypoint with a non-empty comment is downloaded as JSON and re-imported
- **THEN** the comment is present and identical on the corresponding waypoint

#### Scenario: Legacy flight plan compatibility
- **WHEN** a flight plan JSON without any `comment` fields is loaded
- **THEN** all waypoints load successfully with no comment

---

### Requirement: Comment icon in waypoint card header
The waypoint card SHALL display a comment icon in the header row, to the left of the delete button.

#### Scenario: Icon hidden when no comment and card not hovered
- **WHEN** a waypoint has no comment and the card is not hovered
- **THEN** the comment icon is not visible

#### Scenario: Icon revealed on hover when no comment
- **WHEN** a waypoint has no comment and the user hovers over the card
- **THEN** the comment icon fades in at low opacity

#### Scenario: Icon always visible when comment exists
- **WHEN** a waypoint has a comment
- **THEN** the comment icon is always visible and rendered in the primary accent colour

---

### Requirement: Inline comment editor
The system SHALL allow the user to add or edit a waypoint comment inline within the waypoint card.

#### Scenario: Open editor by clicking icon (no comment)
- **WHEN** the user clicks the comment icon on a card with no comment
- **THEN** a textarea expands at the bottom of the card, auto-focused, ready for input

#### Scenario: Open editor by clicking icon (comment exists)
- **WHEN** the user clicks the comment icon on a card with an existing comment
- **THEN** a textarea expands at the bottom of the card pre-filled with the current comment

#### Scenario: Open editor by clicking preview line
- **WHEN** the user clicks the truncated comment preview line on a card with an existing comment
- **THEN** a textarea expands at the bottom of the card pre-filled with the current comment

#### Scenario: Save comment on blur
- **WHEN** the user types in the textarea and clicks outside the card
- **THEN** the comment is saved to the flight plan and the textarea collapses

#### Scenario: Save comment on Enter
- **WHEN** the user types in the textarea and presses Enter
- **THEN** the comment is saved to the flight plan and the textarea collapses

#### Scenario: Discard comment edit on Escape
- **WHEN** the user is editing the textarea and presses Escape
- **THEN** the comment reverts to its previous value and the textarea collapses

#### Scenario: Delete comment by clearing text
- **WHEN** the user clears the textarea content and saves (blur or Enter)
- **THEN** the comment is removed from the waypoint

---

### Requirement: Comment preview in waypoint card
When a comment exists and the editor is not open, the system SHALL display a single truncated line of the comment at the bottom of the waypoint card.

#### Scenario: Preview shown when comment is set
- **WHEN** a waypoint has a non-empty comment and the textarea is not open
- **THEN** a single-line truncated preview of the comment appears at the bottom of the card

#### Scenario: Preview hidden when no comment
- **WHEN** a waypoint has no comment
- **THEN** no preview line is shown at the bottom of the card

---

### Requirement: Comment rendered on kneeboard page
The system SHALL render the waypoint comment on the kneeboard page for which that waypoint is the destination. The comment box SHALL be positioned to the right of the info box (fuel/coordinates), aligned to the same top edge and height, spanning the remaining page width.

#### Scenario: Comment box rendered alongside info box
- **WHEN** a leg's destination waypoint has a non-empty comment and a kneeboard page is generated for that leg
- **THEN** a semi-transparent comment box appears to the right of the info box at the same vertical position, filling the remaining width

#### Scenario: Comment strip absent when no comment
- **WHEN** a leg's destination waypoint has no comment
- **THEN** no comment box is drawn on the kneeboard page

#### Scenario: Long comment truncated on kneeboard
- **WHEN** a comment is too long to fit in two lines within the available strip width
- **THEN** the text is word-wrapped up to two lines and truncated with an ellipsis if it overflows

#### Scenario: Comment box falls back to full-width when no info box
- **WHEN** a kneeboard page is generated with no detail keys (no info box) but the destination waypoint has a comment
- **THEN** the comment appears as a full-width strip at the bottom of the page
