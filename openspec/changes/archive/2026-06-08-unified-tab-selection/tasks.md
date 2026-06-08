## 1. Create unified SelectionContext

- [x] 1.1 Create `packages/frontend/src/contexts/SelectionContext.tsx` with the `Selection` discriminated union type (`{ kind: 'waypoint'; index: number } | { kind: 'object'; id: string } | null`), `SelectionContextValue` interface, `SelectionProvider` component, and `useSelection` hook

## 2. Refactor WaypointSelectionContext as adapter

- [x] 2.1 Rewrite `useWaypointSelection` in `WaypointSelectionContext.tsx` as a thin adapter over `useSelection` (derive `selectedIndex` / `setSelectedIndex` from the unified context)
- [x] 2.2 Remove `WaypointSelectionProvider` and the internal context/state — keep `CoordEntryState` and `CursorSlot` type exports as they are imported by other files

## 3. Refactor ObjectSelectionContext as adapter

- [x] 3.1 Rewrite `useObjectSelection` in `ObjectSelectionContext.tsx` as a thin adapter over `useSelection` (derive `selectedId` / `setSelectedId` from the unified context)
- [x] 3.2 Remove `ObjectSelectionProvider` and the internal context/state

## 4. Update PlannerApp

- [x] 4.1 Replace `<WaypointSelectionProvider>` and `<ObjectSelectionProvider>` with a single `<SelectionProvider>` wrapping the same children
- [x] 4.2 Add a `handleTabChange` function (or update the existing `onTabChange` call site) that calls `setSelection(null)` and `setCoordEntry(null)` before calling `setActiveTab`

## 5. Verify

- [x] 5.1 Run TypeScript compilation (`pnpm tsc --noEmit`) with no errors
- [x] 5.2 Select a waypoint, switch to Objects tab — confirm waypoint highlight disappears from sidebar and map
- [x] 5.3 Select an object, switch to Flight Plan tab — confirm object highlight disappears from sidebar and map
- [x] 5.4 Start coord entry on a waypoint, switch to Objects tab — confirm coord entry overlay is dismissed
- [x] 5.5 Start coord entry on a marker, switch to Flight Plan tab — confirm coord entry overlay is dismissed
