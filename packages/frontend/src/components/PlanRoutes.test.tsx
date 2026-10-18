import { useEffect } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';

// --- Stub providers, layout and pages so the real route table is under test. ---
let sel: any;
let fp: any;
vi.mock('../contexts/PlanSelectionContext', () => ({
  PlanSelectionProvider: ({ children }: any) => <>{children}</>,
  usePlanSelection: () => sel,
}));
vi.mock('../contexts/FlightPlanContext', () => ({
  FlightPlanProvider: ({ children }: any) => <>{children}</>,
  useFlightPlan: () => fp,
}));
vi.mock('../contexts/PerformanceContext', () => ({ PerformanceProvider: ({ children }: any) => <>{children}</> }));
vi.mock('../contexts/LibraryContext', () => ({ LibraryProvider: ({ children }: any) => <>{children}</> }));
vi.mock('../contexts/AuthContext', () => ({ AuthProvider: ({ children }: any) => <>{children}</> }));
vi.mock('../contexts/SpaceAssetsContext', () => ({ SpaceAssetsProvider: ({ children }: any) => <>{children}</> }));
vi.mock('./Layout', async () => {
  const { Outlet } = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { default: () => <Outlet /> };
});
let navMounts = 0;
vi.mock('./PlannerApp', () => ({
  default: () => {
    useEffect(() => { navMounts += 1; }, []);
    return <div>NAV VIEW</div>;
  },
}));
vi.mock('./PerformancePage', () => ({ default: () => <div>PERF VIEW</div> }));
vi.mock('./AttackPlanningPage', () => ({ default: () => <div>ATTACK VIEW</div> }));
vi.mock('./TheatreLibraryPage', () => ({ TheatreLibraryPage: () => <div>LIBRARY VIEW</div> }));
vi.mock('./PlansHomePage', () => ({ default: () => <div>HOME VIEW</div> }));
vi.mock('./About', () => ({ About: () => <div>ABOUT</div> }));

import { AppRoutes } from './App';

const P1 = 'AAAAAAAAAAA1';
let nav: ReturnType<typeof useNavigate>;
const Probe = () => {
  const loc = useLocation();
  nav = useNavigate();
  return <div data-testid="path">{loc.pathname}</div>;
};

function renderAt(entries: string[], index = entries.length - 1) {
  const tree = () => (
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <AppRoutes />
      <Probe />
    </MemoryRouter>
  );
  const utils = render(tree());
  return { ...utils, rerenderTree: () => utils.rerender(tree()) };
}
const path = () => screen.getByTestId('path').textContent;

beforeEach(() => {
  navMounts = 0;
  sel = { activePlanId: P1, atHome: false };
  fp = { flightPlan: { name: 'Ingress Alpha' }, flightPlanId: P1 };
});

describe('route table and legacy redirects (5.1)', () => {
  it('/ redirects to the active plan NAV address', async () => {
    renderAt(['/']);
    await waitFor(() => expect(path()).toBe(`/p/${P1}/ingress-alpha`));
    expect(screen.getByText('NAV VIEW')).toBeInTheDocument();
  });

  it('/performance and /attack redirect to the plan tabs', async () => {
    renderAt(['/performance']);
    await waitFor(() => expect(path()).toBe(`/p/${P1}/ingress-alpha/perf`));
    expect(screen.getByText('PERF VIEW')).toBeInTheDocument();
  });

  it('/attack redirects to the attack tab', async () => {
    renderAt(['/attack']);
    await waitFor(() => expect(path()).toBe(`/p/${P1}/ingress-alpha/attack`));
    expect(screen.getByText('ATTACK VIEW')).toBeInTheDocument();
  });

  it('a bare /p/:id gets its slug', async () => {
    renderAt([`/p/${P1}`]);
    await waitFor(() => expect(path()).toBe(`/p/${P1}/ingress-alpha`));
  });

  it('signed-in with no plan: / goes to Home', async () => {
    sel = { activePlanId: 'local', atHome: true };
    renderAt(['/']);
    await waitFor(() => expect(path()).toBe('/plans'));
    expect(screen.getByText('HOME VIEW')).toBeInTheDocument();
  });

  it('a plan named "perf" is not confused with the PERF tab', async () => {
    fp.flightPlan.name = 'perf';
    const { unmount } = renderAt([`/p/${P1}/perf`]);
    expect(screen.getByText('NAV VIEW')).toBeInTheDocument();
    expect(path()).toBe(`/p/${P1}/perf`);
    unmount();
    renderAt([`/p/${P1}/perf/perf`]);
    expect(screen.getByText('PERF VIEW')).toBeInTheDocument();
  });

  it('library stays outside plan addresses', () => {
    renderAt(['/library']);
    expect(screen.getByText('LIBRARY VIEW')).toBeInTheDocument();
    expect(path()).toBe('/library');
  });
});

describe('slug canonicalization (5.2)', () => {
  it('corrects a stale slug in place, keeping the tab', async () => {
    renderAt([`/p/${P1}/old-name/perf`]);
    await waitFor(() => expect(path()).toBe(`/p/${P1}/ingress-alpha/perf`));
    expect(screen.getByText('PERF VIEW')).toBeInTheDocument();
  });

  it('a name change (local or synced) updates the slug without remounting the editor', async () => {
    const { rerenderTree } = renderAt([`/p/${P1}/ingress-alpha`]);
    expect(navMounts).toBe(1);

    fp = { ...fp, flightPlan: { name: 'Strike Batumi' } };
    rerenderTree();

    await waitFor(() => expect(path()).toBe(`/p/${P1}/strike-batumi`));
    expect(screen.getByText('NAV VIEW')).toBeInTheDocument();
    expect(navMounts).toBe(1); // same editor instance — no remount
  });

  it('uses replace: going back skips the old slug', async () => {
    renderAt(['/plans', `/p/${P1}/old-name`]);
    await waitFor(() => expect(path()).toBe(`/p/${P1}/ingress-alpha`));
    act(() => nav(-1));
    await waitFor(() => expect(path()).toBe('/plans'));
  });

  it('does not canonicalize from a stale document (another plan still loaded)', async () => {
    fp = { flightPlan: { name: 'Other Plan' }, flightPlanId: 'AAAAAAAAAAA2' };
    renderAt([`/p/${P1}/old-name`]);
    await new Promise((r) => setTimeout(r, 20));
    expect(path()).toBe(`/p/${P1}/old-name`);
  });
});
