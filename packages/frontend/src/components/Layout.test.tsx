import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

let authState: any;
let selState: any;
let fpState: any;
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('../contexts/PlanSelectionContext', () => ({ usePlanSelection: () => selHook() }));
vi.mock('../contexts/FlightPlanContext', () => ({ useFlightPlan: () => fpState }));
vi.mock('../contexts/PerformanceContext', () => ({
  usePerformance: () => ({ performance: { regimes: [] } }),
}));
vi.mock('./AuthMenu', () => ({ AuthMenu: () => <div data-testid="auth-menu" /> }));

import Layout from './Layout';

// Like the real provider, an address is only "unresolved" while the URL still
// names a plan that does not resolve (after a redirect it no longer does).
function selHook() {
  const { pathname } = useLocation();
  const namesPlan = pathname.startsWith('/p/') && !(selState.activePlanId === 'local' && pathname.startsWith('/p/local'));
  return { ...selState, requestUnresolved: selState.requestUnresolved && namesPlan };
}

const P1 = 'AAAAAAAAAAA1';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>ROOT CONTENT</div>} />
          <Route path="/plans" element={<div>HOME CONTENT</div>} />
          <Route path="/trash" element={<div>TRASH CONTENT</div>} />
          <Route path="/library" element={<div>LIB CONTENT</div>} />
          <Route path="/p/:id" element={<div>CANON CONTENT</div>} />
          <Route path="/p/:id/:slug/*" element={<div>PLAN CONTENT</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState = { status: 'authenticated' };
  selState = {
    atHome: false, isResolving: false, requestUnresolved: false,
    activePlanId: P1, hasActivePlan: true,
  };
  fpState = {
    flightPlan: { name: 'Ingress Alpha', points: [] },
    flightPlanId: P1,
    onFlightPlanUpdate: vi.fn(),
  };
});

describe('Layout — editing chrome', () => {
  it('signed-in: breadcrumb shows the plan name and links to Home', () => {
    renderAt(`/p/${P1}/ingress-alpha`);
    const crumb = screen.getByText(/‹ Ingress Alpha/);
    expect(crumb.closest('a')).toHaveAttribute('href', '/plans');
  });

  it('plan-scoped tabs link under the plan address; LIBRARY stays at /library', () => {
    renderAt(`/p/${P1}/ingress-alpha`);
    expect(screen.getByRole('link', { name: 'NAV' })).toHaveAttribute('href', `/p/${P1}/ingress-alpha`);
    expect(screen.getByRole('link', { name: 'PERF' })).toHaveAttribute('href', `/p/${P1}/ingress-alpha/perf`);
    expect(screen.getByRole('link', { name: 'ATTACK' })).toHaveAttribute('href', `/p/${P1}/ingress-alpha/attack`);
    expect(screen.getByRole('link', { name: 'LIBRARY' })).toHaveAttribute('href', '/library');
  });

  it('LIBRARY is separated from the plan-scoped tabs by a divider', () => {
    const { container } = renderAt(`/p/${P1}/ingress-alpha`);
    const attack = screen.getByRole('link', { name: 'ATTACK' });
    const library = screen.getByRole('link', { name: 'LIBRARY' });
    const divider = container.querySelector('span[aria-hidden].w-px');
    expect(divider).toBeInTheDocument();
    const pos = (el: Element | null) =>
      el ? Array.prototype.indexOf.call(el.parentElement!.children, el) : -1;
    expect(pos(attack)).toBeLessThan(pos(divider));
    expect(pos(divider)).toBeLessThan(pos(library));
  });

  it('anonymous: tabs under /p/local, no breadcrumb', () => {
    authState = { status: 'anonymous' };
    selState = { ...selState, activePlanId: 'local' };
    fpState = { ...fpState, flightPlan: { name: 'My Plan', points: [] }, flightPlanId: 'local' };
    renderAt('/p/local/my-plan');
    expect(screen.queryByText(/‹/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'NAV' })).toHaveAttribute('href', '/p/local/my-plan');
  });

  it('does not trust a stale document name for tab links', () => {
    fpState = { ...fpState, flightPlan: { name: 'Other Plan', points: [] }, flightPlanId: 'AAAAAAAAAAA2' };
    renderAt(`/p/${P1}/ingress-alpha`);
    expect(screen.getByRole('link', { name: 'NAV' })).toHaveAttribute('href', `/p/${P1}/plan`);
    expect(screen.queryByText(/‹/)).not.toBeInTheDocument();
  });
});

describe('Layout — unsaved new plan notice', () => {
  it('shows the commit failure', () => {
    selState = { ...selState, commitError: 'This new plan is not saved to your account yet.' };
    renderAt(`/p/${P1}/ingress-alpha`);
    expect(screen.getByRole('status')).toHaveTextContent(/not saved to your account yet/);
  });

  it('shows nothing when there is no failure', () => {
    renderAt(`/p/${P1}/ingress-alpha`);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Layout — routing', () => {
  it('signed-in with no plan to open is sent Home', () => {
    selState = { ...selState, atHome: true, hasActivePlan: false };
    renderAt('/library');
    expect(screen.getByText('HOME CONTENT')).toBeInTheDocument();
    expect(screen.getByText('FLIGHT PLANS')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'NAV' })).not.toBeInTheDocument();
  });

  it('signed-in on an unresolved address is sent Home', () => {
    selState = { ...selState, requestUnresolved: true, atHome: true, hasActivePlan: false };
    renderAt('/p/AAAAAAAAAAA9/x');
    expect(screen.getByText('HOME CONTENT')).toBeInTheDocument();
  });

  it('anonymous on an unresolved address is sent to their local plan', () => {
    authState = { status: 'anonymous' };
    selState = { ...selState, requestUnresolved: true, activePlanId: 'local' };
    renderAt(`/p/${P1}/x`);
    expect(screen.getByText('CANON CONTENT')).toBeInTheDocument();
  });

  it('anonymous is sent away from Home', () => {
    authState = { status: 'anonymous' };
    selState = { ...selState, activePlanId: 'local' };
    renderAt('/plans');
    expect(screen.getByText('ROOT CONTENT')).toBeInTheDocument();
  });

  it('shows a loading state while resolving, and does not redirect', () => {
    selState = { ...selState, isResolving: true, requestUnresolved: false, atHome: false };
    renderAt(`/p/${P1}/ingress-alpha`);
    expect(screen.getByText(/Loading your plans/)).toBeInTheDocument();
    expect(screen.queryByText('PLAN CONTENT')).not.toBeInTheDocument();
  });
});

describe('Layout — the Trash and trashed plans (add-trash-and-soft-delete 7.2/7.3)', () => {
  it('signed-in with no active plan stays on the Trash, with a way back to the list', () => {
    selState = { ...selState, atHome: true, hasActivePlan: false };
    renderAt('/trash');
    expect(screen.getByText('TRASH CONTENT')).toBeInTheDocument();
    expect(screen.getByText('‹ FLIGHT PLANS').closest('a')).toHaveAttribute('href', '/plans');
    expect(screen.queryByText('NAV')).not.toBeInTheDocument();
  });

  it('anonymous has no Trash', () => {
    authState = { status: 'anonymous' };
    selState = { ...selState, activePlanId: 'local' };
    renderAt('/trash');
    expect(screen.getByText('ROOT CONTENT')).toBeInTheDocument();
  });

  it("a trashed plan's address falls back to the plan list", () => {
    // A trashed plan is not in the space's list, so its address does not resolve.
    selState = { ...selState, requestUnresolved: true, atHome: true, hasActivePlan: false };
    renderAt(`/p/${P1}/ingress-alpha`);
    expect(screen.getByText('HOME CONTENT')).toBeInTheDocument();
  });
});
