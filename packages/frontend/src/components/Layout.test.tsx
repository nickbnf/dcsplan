import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

let authState: any;
let selState: any;
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../contexts/PlanSelectionContext', () => ({ usePlanSelection: () => selState }));
// RegimeConsistencyGuard dependencies — stub out.
vi.mock('../contexts/FlightPlanContext', () => ({
  useFlightPlan: () => ({ flightPlan: { points: [] }, onFlightPlanUpdate: vi.fn() }),
}));
vi.mock('../contexts/PerformanceContext', () => ({
  usePerformance: () => ({ performance: { regimes: [] } }),
}));
vi.mock('./AuthMenu', () => ({ AuthMenu: () => <div data-testid="auth-menu" /> }));

import Layout from './Layout';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>NAV CONTENT</div>} />
          <Route path="/plans" element={<div>HOME CONTENT</div>} />
          <Route path="/library" element={<div>LIB CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState = { status: 'authenticated' };
  selState = {
    atHome: false,
    isLoadingSelection: false,
    activePlanName: null,
  };
});

describe('Layout — editing chrome (9.2)', () => {
  it('signed-in with an active plan shows the breadcrumb and both tab clusters', () => {
    selState.activePlanName = 'Ingress Alpha';
    renderAt('/');
    // Breadcrumb links back to Home.
    const crumb = screen.getByText(/‹ Ingress Alpha/);
    expect(crumb.closest('a')).toHaveAttribute('href', '/plans');
    // Plan-scoped cluster + space-scoped cluster both present.
    expect(screen.getByRole('link', { name: 'NAV' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PERF' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ATTACK' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LIBRARY' })).toBeInTheDocument();
    expect(screen.getByText('NAV CONTENT')).toBeInTheDocument();
  });

  it('anonymous shows the tabs but no breadcrumb', () => {
    authState = { status: 'anonymous' };
    renderAt('/');
    expect(screen.queryByText(/‹/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NAV' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'LIBRARY' })).toBeInTheDocument();
  });

  it('LIBRARY is separated from the plan-scoped tabs by a divider', () => {
    selState.activePlanName = 'Ingress Alpha';
    const { container } = renderAt('/');
    const attack = screen.getByRole('link', { name: 'ATTACK' });
    const library = screen.getByRole('link', { name: 'LIBRARY' });
    const divider = container.querySelector('span[aria-hidden].w-px');
    expect(divider).toBeInTheDocument();
    // Divider sits between the ATTACK (plan-scoped) and LIBRARY (space-scoped) tabs.
    const pos = (el: Element | null) =>
      el ? Array.prototype.indexOf.call(el.parentElement!.children, el) : -1;
    expect(pos(attack)).toBeLessThan(pos(divider));
    expect(pos(divider)).toBeLessThan(pos(library));
  });
});

describe('Layout — Home routing (9.2)', () => {
  it('redirects a signed-in user with no active plan to Home', () => {
    selState.atHome = true;
    renderAt('/');
    expect(screen.getByText('HOME CONTENT')).toBeInTheDocument();
    expect(screen.getByText('FLIGHT PLANS')).toBeInTheDocument();
    // No editing tabs on Home.
    expect(screen.queryByRole('link', { name: 'NAV' })).not.toBeInTheDocument();
  });

  it('redirects an anonymous user away from Home', () => {
    authState = { status: 'anonymous' };
    renderAt('/plans');
    expect(screen.getByText('NAV CONTENT')).toBeInTheDocument();
  });

  it('shows a loading state while the selection is loading', () => {
    selState.isLoadingSelection = true;
    renderAt('/');
    expect(screen.getByText(/Loading your plans/)).toBeInTheDocument();
    expect(screen.queryByText('NAV CONTENT')).not.toBeInTheDocument();
  });
});
