/** This device's anonymous data as an import source (add-local-data-import
 *  tasks 3.3, 3.8; spec: local-data-migration). */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let anonymousPlan: any = null;
const resetAnonymousPlan = vi.fn(async () => { anonymousPlan = null; });
vi.mock('../hooks/useYjsFlightPlan', () => ({
  readAnonymousPlan: async () => anonymousPlan,
  resetAnonymousPlan: () => resetAnonymousPlan(),
}));

import { defaultAircraft } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { loadLibrary, saveLibrary } from '../utils/libraryStorage';
import { loadPerformance, savePerformance } from '../utils/performanceStorage';
import { LOCAL_PLAN_ID_KEY, LOCAL_PROFILE_ID_KEY, moveOffDevice, readLocalData } from './localSource';

const E1 = { id: 'e1', type: 'sam_site' as const, lat: 42, lon: 41 };
const E2 = { id: 'e2', type: 'aaa' as const, lat: 35, lon: 36, range: 2 };
const edited = () => ({ ...flightPlanUtils.newFlightPlan('caucasus'), name: 'Strike North' });

beforeEach(() => {
  localStorage.clear();
  anonymousPlan = null;
  resetAnonymousPlan.mockClear();
});

describe('readLocalData', () => {
  it('finds nothing on a fresh device', async () => {
    anonymousPlan = flightPlanUtils.newFlightPlan('caucasus');
    savePerformance(defaultAircraft());
    expect(await readLocalData()).toBeNull();
  });

  it('offers only the items that changed', async () => {
    anonymousPlan = edited();
    const source = await readLocalData();
    expect(source?.plan?.name).toBe('Strike North');
    expect(source?.entries).toEqual({});
    expect(source?.profile).toBeNull();
  });

  it('collects every theatre\'s library and a changed profile', async () => {
    saveLibrary('caucasus', [E1]);
    saveLibrary('syria', [E2]);
    savePerformance({ ...defaultAircraft(), model: 'F-16C' });
    const source = await readLocalData();
    expect(source?.plan).toBeNull();
    expect(source?.entries).toEqual({ caucasus: [E1], syria: [E2] });
    expect(source?.profile?.aircraft.model).toBe('F-16C');
  });

  it('keeps the plan and profile ids stable across reads', async () => {
    anonymousPlan = edited();
    savePerformance({ ...defaultAircraft(), model: 'F-16C' });
    const first = await readLocalData();
    const second = await readLocalData();
    expect(first?.planId).toBeTruthy();
    expect(second?.planId).toBe(first?.planId);
    expect(second?.profile?.id).toBe(first?.profile?.id);
  });
});

describe('moveOffDevice', () => {
  async function everything() {
    anonymousPlan = edited();
    saveLibrary('caucasus', [E1]);
    savePerformance({ ...defaultAircraft(), model: 'F-16C' });
    return (await readLocalData())!;
  }

  it('removes the imported items and keeps the rest', async () => {
    const source = await everything();
    await moveOffDevice(source, { plan: 'done', entries: 'done', profile: 'skipped' });
    expect(resetAnonymousPlan).toHaveBeenCalled();
    expect(loadLibrary('caucasus')).toEqual([]);
    expect(loadPerformance().model).toBe('F-16C');
    expect(localStorage.getItem(LOCAL_PLAN_ID_KEY)).toBeNull();
    expect(localStorage.getItem(LOCAL_PROFILE_ID_KEY)).not.toBeNull();
  });

  it('keeps the plan when only the library was accepted', async () => {
    const source = await everything();
    await moveOffDevice(source, { plan: 'failed', entries: 'done', profile: 'done' });
    expect(resetAnonymousPlan).not.toHaveBeenCalled();
    expect(loadLibrary('caucasus')).toEqual([]);
    expect(loadPerformance()).toEqual(defaultAircraft());
    expect(localStorage.getItem(LOCAL_PLAN_ID_KEY)).toBe(source.planId);
  });

  it('then offers only what remains, under the same plan id', async () => {
    const source = await everything();
    await moveOffDevice(source, { plan: 'failed', entries: 'done', profile: 'done' });
    const retry = await readLocalData();
    expect(retry?.plan?.name).toBe('Strike North');
    expect(retry?.planId).toBe(source.planId);
    expect(retry?.entries).toEqual({});
    expect(retry?.profile).toBeNull();
  });

  it('moves nothing when the import failed', async () => {
    const source = await everything();
    await moveOffDevice(source, { plan: 'failed', entries: 'failed', profile: 'failed' });
    expect(loadLibrary('caucasus')).toEqual([E1]);
    expect(loadPerformance().model).toBe('F-16C');
    expect(resetAnonymousPlan).not.toHaveBeenCalled();
  });
});
