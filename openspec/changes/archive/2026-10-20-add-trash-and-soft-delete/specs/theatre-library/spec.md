# Spec Delta

## MODIFIED Requirements

### Requirement: Library entry deletion with reference detection
The user SHALL be able to delete a library entry via a control on its card, requiring a confirmation dialog.

In the **anonymous** tier, if the current flight plan references the entry, the confirmation dialog SHALL state this explicitly, and confirming the deletion SHALL remove the entry and remove the reference from the plan as well.

In the **signed-in** tier, deletion SHALL move the entry to the Trash and SHALL NOT modify any plan, including the current one; every plan's references to it are left in place and become unresolved, shown as a missing-object placeholder as defined by `map-objects`. The confirmation states how many plans reference the entry, as defined by `soft-delete`.

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
