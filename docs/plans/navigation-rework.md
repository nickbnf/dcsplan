# Navigation Rework: Multi-Screen Layout

## Context

The app currently has a single main screen (Navigation/Planner) with a sidebar + map layout. We need to support three independent screens — Navigation, Performance, and Attack Planning — with a top tab bar for switching between them. This lays the groundwork for the app to grow beyond pure flight plan editing.

## Approach: Top Tab Bar with Shared Layout

A ~44px horizontal tab bar at the top of the viewport, with tab buttons on the left and the app title + utility links on the right. Each tab renders a full screen below (sidebar + content area pattern). The existing Navigation screen remains the default (`/`) route.

```
+--[NAV]--[PERF]--[ATTACK]--------[DCS Tactical Planner]--[⚙]--+
|                                                                 |
| +--Sidebar (400px)--+ +--Map / Content Area----------------+   |
| |  (screen-specific) | |  (screen-specific)                 |   |
| +--------------------+ +------------------------------------+   |
+-----------------------------------------------------------------+
```

## Implementation Steps

### Step 1: Create Layout component with tab bar

**New file:** `packages/frontend/src/components/Layout.tsx`

- Full-viewport container: `h-screen w-screen flex flex-col`
- Top bar (~44px): tab buttons (NavLink) on the left, app title + About link on the right
- `<Outlet />` in a `flex-1 overflow-hidden` container for screen content
- Active tab styling using `NavLink`'s active class (bottom border accent or background highlight)
- Tab labels: **NAV**, **PERF**, **ATTACK** (short, aviation-style)

### Step 2: Update App.tsx routing

**Modify:** `packages/frontend/src/components/App.tsx`

- Wrap main routes in a `<Route element={<Layout />}>` parent
- Nest: `/` → PlannerApp, `/performance` → PerformancePage, `/attack` → AttackPlanningPage
- Keep `/about` outside the layout (standalone page)

```tsx
<Routes>
  <Route element={<Layout />}>
    <Route path="/" element={<PlannerApp />} />
    <Route path="/performance" element={<PerformancePage />} />
    <Route path="/attack" element={<AttackPlanningPage />} />
  </Route>
  <Route path="/about" element={<About />} />
</Routes>
```

### Step 3: Adjust PlannerApp height management

**Modify:** `packages/frontend/src/components/PlannerApp.tsx`

- Remove `h-screen w-screen` from the outer div (Layout now owns viewport sizing)
- Change to `flex flex-1 w-full overflow-hidden`

### Step 4: Move title and About link from TitleZone to Layout

**Modify:** `packages/frontend/src/components/sidebar/TitleZone.tsx`

- Remove the "DCS Tactical Planner" `<h1>` and the About `<Link>` (these now live in the tab bar)
- TitleZone retains: theatre selector dropdown, mouse coordinates display

### Step 5: Create placeholder screens

**New file:** `packages/frontend/src/components/PerformancePage.tsx`
**New file:** `packages/frontend/src/components/AttackPlanningPage.tsx`

- Each is a stub with the same sidebar + content area layout pattern
- Show screen name and "Coming soon" placeholder content
- These will be fleshed out in future work

## Key Files

| File | Action |
|------|--------|
| `packages/frontend/src/components/Layout.tsx` | **Create** — shared layout with tab bar |
| `packages/frontend/src/components/App.tsx` | **Modify** — nested routes |
| `packages/frontend/src/components/PlannerApp.tsx` | **Modify** — remove viewport sizing |
| `packages/frontend/src/components/sidebar/TitleZone.tsx` | **Modify** — remove title/about link |
| `packages/frontend/src/components/PerformancePage.tsx` | **Create** — stub |
| `packages/frontend/src/components/AttackPlanningPage.tsx` | **Create** — stub |

## State Sharing

The three screens are mostly independent. Shared state (flight plan, theatre selection) is already persisted to localStorage via `usePersistedFlightPlan`, so screens that need the same data can each call the hook independently — no context provider needed for now.

## Verification

1. `pnpm dev` — app starts without errors
2. Navigation tab is active by default at `/`, showing the existing map + sidebar
3. Clicking PERF and ATTACK tabs navigates to `/performance` and `/attack`, showing placeholder content
4. Browser back/forward works correctly between tabs
5. The existing flight plan functionality (add/edit/delete waypoints, draw on map, generate kneeboard) works identically on the Navigation screen
6. The About page (`/about`) still works as a standalone page
7. Run existing tests: `pnpm test` passes
