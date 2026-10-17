# Spec Delta

## ADDED Requirements

### Requirement: The listed plan name follows the plan's own name

A signed-in plan's name SHALL have a single source: the name edited in the plan itself. The name shown in the Flight Plans list SHALL follow it, including renames made on another device or made offline and synced later. The list SHALL also reflect when the plan was last edited. The **anonymous** tier has no list, so this does not apply to it.

#### Scenario: Renaming in the editor updates the list
- **WHEN** a signed-in user renames a plan in its editor while connected
- **THEN** the Flight Plans list shows the new name

#### Scenario: An offline rename reaches the list on reconnect
- **WHEN** a signed-in user renames a plan while disconnected and later reconnects
- **THEN** the Flight Plans list shows the new name once the plan has synced

#### Scenario: The list shows when the plan was last edited
- **WHEN** a signed-in user edits a plan without renaming it
- **THEN** the plan's "edited" time in the Flight Plans list reflects that edit
