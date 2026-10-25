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
// Set to stand in for a synced plan's version finalization (add-version-history).
let finalizeVersion: (() => Promise<unknown>) | undefined;
const usePlan = () => {
  const flightPlan = useSyncExternalStore(planStore.subscribe, planStore.get);
  return { flightPlan, onFlightPlanUpdate: planStore.set, replaceFlightPlan: planStore.set, finalizeVersion };
};

vi.mock('../contexts/FlightPlanContext', () => ({ useFlightPlan: () => usePlan(), useOptionalFlightPlan: () => usePlan() }));
vi.mock('../contexts/SpaceAssetsContext', () => ({
  useSpaceAssets: () => ({
    sync: engine,
    state: useSyncExternalStore(engine.subscribe, engine.getState),
    status: useSyncExternalStore(engine.subscribe, engine.getStatus),
  }),
}));

vi.mock('../api/assetApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/assetApi')>()),
  countReferences: vi.fn(async () => 2),
}));

import PerformancePage from './PerformancePage';
import { countReferences } from '../api/assetApi';
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
  finalizeVersion = undefined;
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

  describe('a confirmed switch saves a version first (add-version-history 8.1)', () => {
    const switchToB = () => {
      seedProfiles();
      plan = { ...plan, profileId: 'pA' };
      renderPage();
      fireEvent.change(chooser(), { target: { value: 'pB' } });
      fireEvent.click(screen.getByText('Switch'));
    };

    it('connected: the version is saved before the bindings are cleared', async () => {
      let profileAtFinalize: string | undefined;
      finalizeVersion = vi.fn(async () => { profileAtFinalize = plan.profileId; return null; });
      switchToB();
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(finalizeVersion).toHaveBeenCalledTimes(1);
      expect(profileAtFinalize).toBe('pA');
      expect(plan.profileId).toBe('pB');
    });

    it('disconnected: switches at once without saving a version', async () => {
      finalizeVersion = vi.fn(async () => null);
      server.offline = true;
      await act(() => engine.pull());
      switchToB();
      expect(finalizeVersion).not.toHaveBeenCalled();
      expect(plan.profileId).toBe('pB');
    });

    it('a failed save does not block the switch', async () => {
      finalizeVersion = vi.fn(async () => { throw new Error('503'); });
      switchToB();
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(finalizeVersion).toHaveBeenCalledTimes(1);
      expect(plan.profileId).toBe('pB');
    });
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

describe('Performance page — deleting profiles (add-trash-and-soft-delete 6.2)', () => {
  it('deleting the flown profile moves it to the Trash and leaves the plan untouched', async () => {
    seedProfiles();
    await act(() => vi.advanceTimersByTimeAsync(2_000));     // profiles reach the server
    plan = { ...plan, profileId: 'pA' };
    const before = plan;
    renderPage();
    fireEvent.click(within(screen.getByRole('region', { name: 'Aircraft identity' })).getByText('Delete'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/will move to the Trash/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(10));
    expect(within(dialog).getByText(/Flown by 2 flight plans/)).toBeInTheDocument();
    expect(countReferences).toHaveBeenCalledWith('profile', 'pA');
    fireEvent.click(within(dialog).getByText('Delete'));
    expect(plan).toBe(before);                                // profileId and every regimeId kept
    expect(plan.points.map(p => p.regimeId)).toEqual([undefined, 'r1', 'r1', 'orphan']);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(server.profileOnServer('pA')).toBeNull();
    expect(engine.isTrashed('profile', 'pA')).toBe(true);
  });

  it('restoring the profile makes the untouched plan fly it again', async () => {
    seedProfiles();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    plan = { ...plan, profileId: 'pA' };
    renderPage();
    fireEvent.click(within(screen.getByRole('region', { name: 'Aircraft identity' })).getByText('Delete'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(chooser().value).not.toBe('pA');
    server.restore('profile', 'pA');
    await act(() => engine.pull());
    expect(chooser().value).toBe('pA');
    expect(plan.points.map(p => p.regimeId)).toEqual([undefined, 'r1', 'r1', 'orphan']);
  });

  it('restoring heals every plan that flies the profile, none of them edited', async () => {
    seedProfiles();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    const flying = (name: string): FlightPlan => ({ ...plan, name, profileId: 'pA' });
    const plans = [flying('P1'), flying('P2'), flying('P3')];
    plan = plans[0];
    renderPage();
    fireEvent.click(within(screen.getByRole('region', { name: 'Aircraft identity' })).getByText('Delete'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    for (const p of plans) {
      act(() => planStore.set(p));                          // open each plan in turn
      expect(chooser().value).not.toBe('pA');
    }
    server.restore('profile', 'pA');
    await act(() => engine.pull());
    for (const p of plans) {
      act(() => planStore.set(p));
      expect(chooser().value).toBe('pA');
      expect(plan).toBe(p);                                 // the plan was never edited
      expect(plan.points.map(pt => pt.regimeId)).toEqual([undefined, 'r1', 'r1', 'orphan']);
    }
  });

  it('deleting a profile the plan does not fly leaves the plan untouched', () => {
    seedProfiles();
    plan = { ...plan, profileId: 'pA' };
    const before = plan;
    renderPage();
    fireEvent.click(row('A-10C'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Aircraft identity' })).getByText('Delete'));
    expect(screen.getByText(/"A-10C" will move to the Trash/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    expect(plan).toBe(before);
    expect(engine.getState().profiles.pB).toBeUndefined();
  });
});

describe('Performance page — plan whose profile is deleted (add-trash-and-soft-delete 6.4)', () => {
  async function deleteFlownProfile() {
    seedProfiles();
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    plan = { ...plan, profileId: 'pA' };
    renderPage();
    fireEvent.click(within(screen.getByRole('region', { name: 'Aircraft identity' })).getByText('Delete'));
    fireEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    await act(() => vi.advanceTimersByTimeAsync(2_000));
  }

  it('a trashed profile is stated as deleted and restorable', async () => {
    await deleteFlownProfile();
    expect(within(header()).getByRole('status')).toHaveTextContent(
      "This plan's profile was deleted and can be restored from the Trash. Choose another profile.",
    );
    expect(within(chooser()).getByText('Deleted profile (manual legs)')).toBeInTheDocument();
  });

  it('a purged profile is stated as deleted, without restore', async () => {
    await deleteFlownProfile();
    server.purge('profile', 'pA');
    await act(() => engine.pull());
    expect(within(header()).getByRole('status')).toHaveTextContent(
      "This plan's profile was deleted. Choose another profile.",
    );
  });

  it('choosing another profile keeps the orphan bindings', async () => {
    await deleteFlownProfile();
    fireEvent.change(chooser(), { target: { value: 'pB' } });
    expect(screen.queryByText('Switch')).toBeNull();
    expect(plan.profileId).toBe('pB');
    expect(plan.points.map(p => p.regimeId)).toEqual([undefined, 'r1', 'r1', 'orphan']);
    expect(within(header()).queryByRole('status')).toBeNull();
  });

  it('a profile not synced yet is not stated as deleted', () => {
    server.offline = true;
    engine.stop();
    engine = new AssetSync('u2', { api: server.api });
    engine.start();
    plan = { ...plan, profileId: 'pZ' };
    renderPage();
    expect(within(header()).queryByRole('status')).toBeNull();
    expect(within(chooser()).getByText('No profile (manual legs)')).toBeInTheDocument();
  });
});
