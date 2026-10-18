/**
 * PerformanceContext as a profile collection (add-library-profile-sync, task 7.1;
 * spec: performance-profile). Runs over a real AssetSync on an in-memory server.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { AssetSync } from '../sync/assetSync';
import { FakeAssetServer } from '../test/fakeAssetServer';
import { defaultAircraft, profileLabel } from '../types/flightPlan';

let engine: AssetSync;
let server: FakeAssetServer;
let planProfileId: string | undefined;

vi.mock('./SpaceAssetsContext', () => ({
  useSpaceAssets: () => ({
    sync: engine,
    state: useSyncExternalStore(engine.subscribe, engine.getState),
    status: useSyncExternalStore(engine.subscribe, engine.getStatus),
  }),
}));
vi.mock('./FlightPlanContext', () => ({
  useOptionalFlightPlan: () => ({ flightPlan: { profileId: planProfileId } }),
}));

import { PerformanceProvider, usePerformance } from './PerformanceContext';

const wrapper = ({ children }: { children: React.ReactNode }) => <PerformanceProvider>{children}</PerformanceProvider>;
const settle = () => act(() => vi.advanceTimersByTimeAsync(2_000));
const F15 = { ...defaultAircraft(), model: 'F-15E' };

beforeEach(async () => {
  vi.useFakeTimers();
  localStorage.clear();
  planProfileId = undefined;
  server = new FakeAssetServer();
  engine = new AssetSync('u1', { api: server.api });
  engine.start();
  await vi.advanceTimersByTimeAsync(10);
});

afterEach(() => {
  engine.stop();
  vi.useRealTimers();
});

describe('PerformanceContext — signed in (7.1)', () => {
  it('starts with an empty collection and resolves the plan to the null profile', () => {
    const { result } = renderHook(() => usePerformance(), { wrapper });
    expect(result.current.tier).toBe('signed-in');
    expect(result.current.profiles).toEqual([]);
    expect(result.current.performance).toEqual(defaultAircraft());
    expect(result.current.flownProfileId).toBeNull();
  });

  it('creates an untitled profile with an id at once, syncs it, and selects it for editing', async () => {
    const { result } = renderHook(() => usePerformance(), { wrapper });
    let id = '';
    act(() => { id = result.current.createProfile(); });
    expect(id).toMatch(/[0-9a-f-]{36}/);
    expect(result.current.editingProfileId).toBe(id);
    expect(profileLabel(result.current.editingAircraft)).toBe('Untitled profile');
    await settle();
    expect(server.profileOnServer(id)?.aircraft).toEqual(defaultAircraft());
    expect(localStorage.getItem('dcsplan.performance')).toBeNull();   // anonymous key untouched
  });

  it('edits act on the edited profile; the plan flies its own profileId', async () => {
    const { result, rerender } = renderHook(() => usePerformance(), { wrapper });
    let a = '', b = '';
    act(() => { a = result.current.addProfile({ aircraft: F15 }); });
    act(() => { b = result.current.addProfile({ aircraft: defaultAircraft() }); });
    planProfileId = a;
    rerender();
    act(() => result.current.setEditingProfileId(b));
    act(() => result.current.updateAircraft({ taxiFuel: 500 }));
    expect(result.current.editingAircraft.taxiFuel).toBe(500);
    expect(result.current.performance.model).toBe('F-15E');        // flown: A, unchanged
    expect(result.current.performance.taxiFuel).toBe(0);
    expect(result.current.flownProfileId).toBe(a);
  });

  it('keeps two profiles with the same label apart', () => {
    const { result } = renderHook(() => usePerformance(), { wrapper });
    act(() => { result.current.addProfile({ aircraft: F15 }); });
    act(() => { result.current.addProfile({ aircraft: F15 }); });
    expect(result.current.profiles.map(p => profileLabel(p.aircraft))).toEqual(['F-15E', 'F-15E']);
    expect(new Set(result.current.profiles.map(p => p.id)).size).toBe(2);
  });

  it('a dangling profileId resolves to the null profile', () => {
    planProfileId = 'not-in-the-space';
    const { result } = renderHook(() => usePerformance(), { wrapper });
    act(() => { result.current.addProfile({ aircraft: F15 }); });
    expect(result.current.performance).toEqual(defaultAircraft());
    expect(result.current.flownProfileId).toBeNull();
  });

  it('deleting goes through the outbox and editing falls back to another profile', async () => {
    const { result } = renderHook(() => usePerformance(), { wrapper });
    let a = '', b = '';
    act(() => { a = result.current.addProfile({ aircraft: defaultAircraft() }); });
    act(() => { b = result.current.addProfile({ aircraft: defaultAircraft() }); });
    await settle();
    act(() => result.current.setEditingProfileId(a));
    act(() => result.current.deleteProfile(a));
    expect(result.current.editingProfileId).toBe(b);
    await settle();
    expect(server.profileOnServer(a)).toBeNull();
  });

  it('addProfile reuses an existing id (plan import with a matching snapshot)', () => {
    const { result } = renderHook(() => usePerformance(), { wrapper });
    let first = '', again = '';
    act(() => { first = result.current.addProfile({ id: 'snap-1', aircraft: F15 }); });
    act(() => { again = result.current.addProfile({ id: 'snap-1', aircraft: defaultAircraft() }); });
    expect(again).toBe(first);
    expect(result.current.profiles).toHaveLength(1);
  });
});
