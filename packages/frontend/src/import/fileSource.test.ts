/** Plan file as an import source (add-local-data-import task 3.2; spec: plan-import). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultAircraft } from '../types/flightPlan';
import { ImportFileError, profileIdFromContent, readPlanFile } from './fileSource';

const PLAN = {
  theatre: 'caucasus', points: [], declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0, name: 'Imported',
};
const AIRCRAFT = { ...defaultAircraft(), model: 'F-16C' };
const E1 = { id: 'e1', type: 'sam_site' as const, lat: 42, lon: 41 };

function validates(flightPlan: object = PLAN) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flightPlan }) });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('readPlanFile', () => {
  it('rejects text that is not JSON', async () => {
    await expect(readPlanFile('{nope')).rejects.toThrow(ImportFileError);
  });

  it('rejects JSON without version or flightPlan', async () => {
    await expect(readPlanFile(JSON.stringify({ version: '1.6' }))).rejects.toThrow(/missing version or flightPlan/);
  });

  it('surfaces the server validation error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ detail: [{ loc: ['flightPlan', 'initFob'], msg: 'must be a number' }] }),
    });
    await expect(readPlanFile(JSON.stringify({ version: '1.6', flightPlan: PLAN })))
      .rejects.toThrow('flightPlan.initFob: must be a number');
  });

  it('reports an unreachable server as an import error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(readPlanFile(JSON.stringify({ version: '1.6', flightPlan: PLAN }))).rejects.toThrow(ImportFileError);
  });

  it('extracts the plan, its library snapshot under its theatre, and its profile', async () => {
    validates({ ...PLAN, profileId: 'from-other-space' });
    const source = await readPlanFile(JSON.stringify({
      version: '1.6', flightPlan: PLAN, librarySnapshot: [E1],
      performanceSnapshot: AIRCRAFT, performanceProfile: { id: 'p-recorded' },
    }));
    expect(source.plan?.name).toBe('Imported');
    expect(source.plan?.profileId).toBeUndefined();
    expect(source.entries).toEqual({ caucasus: [E1] });
    expect(source.profile).toEqual({ id: 'p-recorded', aircraft: AIRCRAFT });
  });

  it('holds no entries or profile when the file has none', async () => {
    validates();
    const source = await readPlanFile(JSON.stringify({ version: '1.6', flightPlan: PLAN }));
    expect(source.entries).toEqual({});
    expect(source.profile).toBeNull();
  });

  it('gives a profile without a recorded id an id derived from its content', async () => {
    validates();
    const file = JSON.stringify({ version: '1.6', flightPlan: PLAN, performanceSnapshot: AIRCRAFT });
    const first = await readPlanFile(file);
    validates();
    const second = await readPlanFile(file);
    expect(first.profile?.id).toBe(second.profile?.id);
    expect(first.profile?.id).toBe(await profileIdFromContent(AIRCRAFT));
  });
});

describe('profileIdFromContent', () => {
  it('is UUID-shaped and differs for different aircraft', async () => {
    const a = await profileIdFromContent(AIRCRAFT);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(await profileIdFromContent({ ...AIRCRAFT, model: 'A-10C' })).not.toBe(a);
  });
});
