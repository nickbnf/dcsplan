# Spec: Plan Lifecycle

## Purpose

Plan lifecycle covers how a flight plan comes into existence: the user chooses the theatre it will be flown on, and that choice is fixed for the plan's lifetime. Creating a plan is the single operation that replaces both "clear the plan" and "change the theatre", because with theatre fixed at creation those collapse into the same thing — start fresh, on a map you pick. What creating a plan does to the plan you already have depends on how many plans the tier supports.

## Requirements

### Requirement: Creating a flight plan selects its theatre

The system SHALL provide a single **New flight plan** action that asks the user which theatre the plan will be flown on and then creates a plan bound to that theatre. The theatre picker SHALL default to the current plan's theatre.

The resulting plan SHALL contain no waypoints and SHALL carry the selected theatre.

#### Scenario: Creating a plan on a chosen theatre
- **WHEN** the user invokes New flight plan, selects a theatre, and confirms
- **THEN** a plan with no waypoints is created, bound to the selected theatre

#### Scenario: Theatre picker defaults to the current theatre
- **WHEN** the user opens the New flight plan action
- **THEN** the current plan's theatre is pre-selected

#### Scenario: Abandoning the action changes nothing
- **WHEN** the user opens the New flight plan action and cancels it
- **THEN** the current plan, its theatre, and its waypoints are unchanged

---

### Requirement: A plan's theatre is fixed once it is created

A plan's theatre SHALL NOT be changeable after creation. The system SHALL present the current plan's theatre as read-only information, and SHALL NOT offer any control that reassigns an existing plan to a different theatre.

To fly a different theatre, the user creates a new plan.

#### Scenario: The plan's theatre is shown but not editable
- **WHEN** the user views a flight plan
- **THEN** its theatre is displayed, and no control is offered that would change the theatre of that plan

#### Scenario: Flying a different theatre means a new plan
- **WHEN** the user wants to plan on a different theatre
- **THEN** the route available is to create a new flight plan on that theatre, leaving the existing plan's theatre untouched

---

### Requirement: Creating a plan replaces or appends according to tier

In the **anonymous** tier, which holds a single plan, creating a plan SHALL replace the current one. In the **signed-in** tier, which holds many plans, creating a plan SHALL add it to the space's plans and SHALL NOT discard any existing plan.

#### Scenario: Anonymous tier replaces the single plan
- **WHEN** an anonymous user creates a new flight plan
- **THEN** the new plan becomes the current plan and the previous one is no longer present

#### Scenario: Signed-in tier adds without discarding
- **WHEN** a signed-in user creates a new flight plan
- **THEN** the new plan is added to the space and every existing plan remains

---

### Requirement: Creating a plan confirms only when work would be lost

The system SHALL require confirmation before creating a plan **only** when doing so would discard existing work — that is, in the anonymous tier when the current plan has at least one waypoint. Otherwise the plan SHALL be created without an additional prompt.

The confirmation SHALL describe only the loss of the current flight plan. It SHALL NOT state or imply that any theatre library is affected.

#### Scenario: Confirmation when the current plan would be lost
- **WHEN** an anonymous user with a non-empty flight plan creates a new plan
- **THEN** a confirmation is shown describing the loss of the current plan, and the plan is created only if the user confirms

#### Scenario: No confirmation when the current plan is empty
- **WHEN** an anonymous user whose flight plan has no waypoints creates a new plan
- **THEN** the new plan is created without an additional prompt

#### Scenario: No confirmation when nothing is discarded
- **WHEN** a signed-in user creates a new plan
- **THEN** no confirmation is shown, because no existing plan is discarded

#### Scenario: The confirmation does not mention the library
- **WHEN** the confirmation is shown while the current theatre's library is non-empty
- **THEN** the confirmation refers only to the flight plan, and makes no claim about the library being cleared or blanked

---

### Requirement: Creating a plan never alters any theatre library

Creating a flight plan SHALL NOT delete, clear, or modify the contents of any theatre's library, including the library of the theatre being left behind.

#### Scenario: The outgoing theatre's library survives
- **WHEN** the user has library entries on one theatre and creates a plan on a different theatre
- **THEN** the first theatre's library entries are left untouched

#### Scenario: Returning to a theatre finds its library intact
- **WHEN** the user creates a plan on a second theatre and later creates a plan back on the first
- **THEN** the first theatre's library entries are all present and unchanged

---

### Requirement: A new plan starts with the library of the theatre it was created on

The library presented for a newly created plan SHALL be the library belonging to the selected theatre.

For a **signed-in** user, this is the active space's library for that theatre, loaded on creation. For an **anonymous** user, it is whatever is held locally for that theatre, which is commonly nothing; an empty library SHALL be treated as a normal starting state and not as an error. No import prompt SHALL be raised.

#### Scenario: Signed-in user gets the space's library for the theatre
- **WHEN** a signed-in user creates a plan on a theatre for which the active space holds library entries
- **THEN** those entries are available to the new plan without any import step

#### Scenario: Anonymous user with no local library starts empty
- **WHEN** an anonymous user creates a plan on a theatre with nothing held locally
- **THEN** the library is empty, no error is shown, and no import prompt is raised

#### Scenario: Anonymous user's existing local library for that theatre is used
- **WHEN** an anonymous user creates a plan on a theatre for which local entries already exist
- **THEN** those entries are available to the new plan

---

### Requirement: Creating a plan is not undoable

Creating a flight plan SHALL NOT be undoable, and SHALL discard the undo and redo history, so that no state from before the creation remains reachable.

#### Scenario: Undo does not restore the replaced plan
- **WHEN** an anonymous user creates a new plan and then invokes undo
- **THEN** the new plan is unchanged and the undo control is shown as unavailable

#### Scenario: No earlier state survives the creation
- **WHEN** the user makes several edits, creates a new plan, and then invokes undo repeatedly
- **THEN** no state from before the creation can be reached
