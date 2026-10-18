/**
 * Performance page, signed in (add-library-profile-sync, tasks 7.2, 8.2, 8.4, 11.2;
 * spec: performance-profile). Real PerformanceContext + AssetSync on an
 * in-memory server; the flight plan is a small external store.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { AssetSync } from '../sync/assetSync';
import { FakeAssetServer } from '../test/fakeAssetServer';
import type { Aircraft, FlightPlan } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

let engine: AssetSync;
let server: FakeAssetServer;

// A minimal flight-plan store standing in for FlightPlanContext.
let plan: FlightPlan;
const planListeners = new Set<() => void>();
const planStore = {
  subscribe: (fn: () => void) => { planListeners.add(fn); return () => planListeners.delete(fn); },
  get: () => plan,
  set: (p: FlightPlan) => { plan = p; planListeners.forEach(fn => fn()); },
};
const usePlan = () => {
  const flightPlan = useSyncExternalStore(planStore.subscribe, planStore.get);
  return { flightPlan, onFlightPlanUpdate: planStore.set, replaceFlightPlan: planStore.set };
};

vi.mock('../contexts/FlightPlanContext', () => ({ useFlightPlan: () => usePlan(), useOptionalFlightPlan: () => usePlan() }));
vi.mock('../contexts/SpaceAssetsContext', () => ({
  useSpaceAssets: () => ({
    sync: engine,
    state: useSyncExternalStore(engine.subscribe, engine.getState),
    status: useSyncExternalStore(engine.subscribe, engine.getStatus),
  }),
}));

import PerformancePage from './PerformancePage';
import { PerformanceProvider } from '../contexts/PerformanceContext';

const REGIME = { id: 'r1', name: 'Cruise', cruise: { tas: 450, ff: 9000 } };
const withRegime: Aircraft = { ...defaultAircraft(), model: 'F-15E', takeoffConfiguration: 'MIL @ 60klb', regimes: [REGIME] };
const wp = (id: string, regimeId?: string) => ({
  id, lat: 42, lon: 41, tas: 300, alt: 10000, fuelFlow: 5000, windSpeed: 0, windDir: 0,
  ...(regimeId ? { regimeId } : {}),
});

function seedProfiles() {
  engine.putProfile({ id: 'pA', aircraft: withRegime });
  engine.putProfile({ id: 'pB', aircraft: { ...defaultAircraft(), model: 'A-10C' } });
}

const renderPage = () => render(<PerformanceProvider><PerformancePage /></PerformanceProvider>);
const header = () => screen.getByTestId('plan-profile-header');
const sidebar = () => screen.getByRole('navigation', { name: 'Profiles' });
const row = (text: string) => within(sidebar()).getByText(text).closest('button')!;
const chooser = () => within(header()).getByLabelText('This plan flies') as HTMLSelectElement;

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  server = new FakeAssetServer();
  engine = new AssetSync('u1', { api: server.api });
  engine.start();
  await vi.advanceTimersByTimeAsync(10);
  plan = {
    theatre: 'caucasus', declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 20000, name: 'P',
    points: [wp('a'), wp('b', 'r1'), wp('c', 'r1'), wp('d', 'orphan')],
  };
});

afterEach(() => {
  engine.stop();
  vi.useRealTimers();
});

describe('Performance page — profile list (7.2, 11.2)', () => {
  it('shows an empty state, and + New adds an untitled profile to the list', () => {
    renderPage();
    expect(screen.getByText('No performance profiles yet')).toBeInTheDocument();
    fireEvent.click(within(sidebar()).getByText('+ New'));
    expect(row('Untitled profile')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByLabelText('Aircraft')).toHaveValue('');
  });

  it('lists profiles by label, the edited one bold and the flown one tagged', () => {
    seedProfiles();
    plan = { ...plan, profileId: 'pA' };
    renderPage();
    expect(row('F-15E')).toHaveTextContent('MIL @ 60klb');
    expect(row('F-15E')).toHaveTextContent('FLOWN');
    expect(row('A-10C')).toHaveTextContent('no T/O config');
    expect(row('A-10C')).not.toHaveTextContent('FLOWN');
    expect(row('F-15E').className).toMatch(/font-bold/);
  });

  it('selecting a profile shows it for editing and does not change the plan', () => {
    seedProfiles();
    plan = { ...plan, profileId: 'pA' };
    renderPage();
    fireEvent.click(row('A-10C'));
    expect(row('A-10C')).toHaveAttribute('aria-current', 'true');
    expect(row('A-10C').className).toMatch(/font-bold/);
    expect(screen.getByLabelText('Aircraft')).toHaveValue('A-10C');
    expect(plan.profileId).toBe('pA');
    expect(plan.points[1].regimeId).toBe('r1');
  });

  it('has no profile-name field, no "Edit profile" dropdown and no not-flown notice', () => {
    seedProfiles();
    plan = { ...plan, profileId: 'pA' };
    renderPage();
    fireEvent.click(row('A-10C'));
    expect(screen.queryByLabelText('Profile name')).toBeNull();
    expect(screen.queryByLabelText('Edit profile')).toBeNull();
    expect(screen.queryByTestId('not-flown-signpost')).toBeNull();
    expect(screen.getAllByRole('combobox')).toHaveLength(1);   // only "This plan flies"
  });

  it('editing the aircraft updates the label in the list and the chooser', () => {
    seedProfiles();
    renderPage();
    fireEvent.change(screen.getByLabelText('T/O Config'), { target: { value: 'AB @ 81klb' } });
    expect(row('F-15E')).toHaveTextContent('AB @ 81klb');
    expect([...chooser().options].map(o => o.textContent)).toContain('F-15E · AB @ 81klb');
  });
});

describe('Performance page — header chooser (8.2)', () => {
  it('is the only control in the header band and lists profiles by label', () => {
    seedProfiles();
    renderPage();
    expect([...chooser().options].map(o => o.textContent)).toEqual([
      'No profile (manual legs)', 'F-15E · MIL @ 60klb', 'A-10C',
    ]);
    expect(within(header()).getAllByRole('combobox')).toHaveLength(1);
    expect(within(header()).queryAllByRole('button')).toHaveLength(0);
  });

  it('switching with bound legs asks first, then clears only bound legs', () => {
    seedProfiles();
    plan = { ...plan, profileId: 'pA' };
    renderPage();
    fireEvent.change(chooser(), { target: { value: 'pB' } });
    expect(screen.getByText(/2 legs are bound to regimes in this profile/)).toBeInTheDocument();
    expect(plan.profileId).toBe('pA');
    fireEvent.click(screen.getByText('Switch'));
    expect(plan.profileId).toBe('pB');
    expect(plan.points.map(p => p.regimeId)).toEqual([undefined, undefined, undefined, 'orphan']);
    expect(plan.points[1].tas).toBe(300);
  });

  it('orphan bindings survive a switch from no profile and resolve in the new one', () => {
    seedProfiles();
    plan = { ...plan, points: [wp('a', 'r1')] };          // no profileId: r1 is an orphan
    renderPage();
    fireEvent.change(chooser(), { target: { value: 'pA' } });
    expect(screen.queryByText('Switch')).toBeNull();      // nothing bound: no confirmation
    expect(plan.profileId).toBe('pA');
    expect(plan.points[0].regimeId).toBe('r1');
  });
});

describe('Performance page — deleting profiles (8.4)', () => {
  it('deleting the flown profile with bound legs warns, then clears the plan', async () => {
    seedProfiles();
    await act(() => vi.advanceTimersByTimeAsync(2_000));     // profiles reach the server
    plan = { ...plan, profileId: 'pA' };
    renderPage();
    fireEvent.click(within(screen.getByRole('region', { name: 'Aircraft identity' })).getByText('Delete'));
    expect(screen.getByText(/2 legs are bound to regimes in this profile/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    expect(plan.profileId).toBeUndefined();
    expect(plan.points.map(p => p.regimeId)).toEqual([undefined, undefined, undefined, 'orphan']);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(server.profileOnServer('pA')).toBeNull();
  });

  it('deleting a profile the plan does not fly leaves the plan untouched', () => {
    seedProfiles();
    plan = { ...plan, profileId: 'pA' };
    const before = plan;
    renderPage();
    fireEvent.click(row('A-10C'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Aircraft identity' })).getByText('Delete'));
    expect(screen.getByText('Delete "A-10C"? This cannot be undone.')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    expect(plan).toBe(before);
    expect(engine.getState().profiles.pB).toBeUndefined();
  });
});
