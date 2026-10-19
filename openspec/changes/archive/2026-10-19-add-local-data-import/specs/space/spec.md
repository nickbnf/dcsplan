# Spec Delta

## ADDED Requirements

### Requirement: The plan list is where plans and local data are imported

In the **signed-in** tier, the plan list (`/plans`) SHALL offer *Import plan file* (`plan-import`). While the device holds local data, it SHALL also offer *Import local data from this device* (`local-data-migration`). Both import into the active space. The **anonymous** tier has no plan list; its plan import stays in the plan's sidebar.

#### Scenario: Plan list offers file import
- **WHEN** a signed-in user opens `/plans`
- **THEN** *Import plan file* is offered

#### Scenario: Plan list offers local data import only when there is some
- **WHEN** a signed-in user opens `/plans` on a device that holds local data
- **THEN** *Import local data from this device* is offered as well; on a device with none, it is not

#### Scenario: Imported plan appears in the list
- **WHEN** a signed-in user imports a plan from `/plans`
- **THEN** the plan is listed in the Personal space with its name and theatre
