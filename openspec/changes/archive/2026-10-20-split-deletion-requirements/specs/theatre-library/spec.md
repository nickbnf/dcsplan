# Spec Delta

## MODIFIED Requirements

### Requirement: Library entry deletion with reference detection
The user SHALL be able to delete a library entry via a control on its card, after a confirmation dialog. Cancelling SHALL leave the entry in place. What deletion does to the plans that reference the entry depends on the tier, as defined by *Anonymous library entry deletion removes the current plan's reference* and *Signed-in library entry deletion moves the entry to the Trash*.

#### Scenario: Delete simple case
- **WHEN** the user clicks delete on a library entry not referenced by the current plan and confirms
- **THEN** the entry is removed from the library

#### Scenario: Delete with current-plan reference
- **WHEN** an anonymous user clicks delete on a library entry that the current plan references
- **THEN** the confirmation dialog states that the entry is referenced by the current plan, and confirming removes the entry from the library and the reference from the plan

#### Scenario: Delete with current-plan reference (signed-in)
- **WHEN** a signed-in user deletes a library entry that the current plan references, and confirms
- **THEN** the entry moves to the Trash, the current plan keeps its reference, and the Objects tab shows it as a placeholder

#### Scenario: Cancel preserves entry
- **WHEN** the user clicks delete on a library entry and cancels the confirmation
- **THEN** the entry remains in the library

#### Scenario: Another plan's reference to a deleted entry is ignored (signed-in)
- **WHEN** a signed-in user deletes a library entry that another plan in the space references, then opens that plan
- **THEN** the plan opens normally, the deleted entry appears as a missing-object placeholder, and the plan's other objects are unaffected

## ADDED Requirements

### Requirement: Anonymous library entry deletion removes the current plan's reference
In the **anonymous** tier, deleting a library entry SHALL remove it for good. If the current flight plan references the entry, the confirmation dialog SHALL say so, and confirming SHALL remove the reference from the plan as well.

#### Scenario: Anonymous confirmation names the plan reference
- **WHEN** an anonymous user opens the delete confirmation for an entry the current plan references
- **THEN** the dialog warns that the current flight plan references the entry and that confirming removes that reference

#### Scenario: Anonymous deletion of an unreferenced entry leaves the plan unchanged
- **WHEN** an anonymous user deletes an entry the current plan does not reference
- **THEN** the entry is removed and the plan is not modified

### Requirement: Signed-in library entry deletion moves the entry to the Trash
In the **signed-in** tier, deleting a library entry SHALL move it to the Trash and SHALL NOT modify any plan, the current one included. Every plan's references to it are left in place and become unresolved, shown as a missing-object placeholder (`map-objects`). The confirmation states how many plans reference the entry (`soft-delete`).

#### Scenario: Signed-in confirmation counts referencing plans
- **WHEN** a signed-in, connected user opens the delete confirmation for an entry that 2 plans reference
- **THEN** the dialog states that the entry moves to the Trash and is used by 2 flight plans

#### Scenario: Restoring the entry resolves every reference
- **WHEN** an entry deleted by a signed-in user is restored from the Trash, no plan having been edited meanwhile
- **THEN** every plan that referenced it shows it again as a normal object
