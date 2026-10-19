/** Anonymous import destination (add-local-data-import task 3.5; spec:
 *  plan-import, *Anonymous import replaces the single plan*; map-objects,
 *  *Library snapshot merge on plan import*). */
import { describe, it, expect, vi } from 'vitest';
import { defaultAircraft } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { importAnonymously, type AnonymousTargets } from './anonymousDestination';
import type { ImportSource } from './types';

const E1 = { id: 'e1', type: 'sam_site' as const, lat: 42, lon: 41 };
const AIRCRAFT = { ...defaultAircraft(), model: 'F-16C' };
const source: ImportSource = {
  kind: 'file',
  plan: { ...flightPlanUtils.newFlightPlan('syria'), name: 'Imported', profileId: 'from-a-space' },
  entries: { syria: [E1] },
  profile: { id: 'p1', aircraft: AIRCRAFT },
};

function targets(): AnonymousTargets & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    mergeEntries: vi.fn(() => { calls.push('entries'); }),
    setProfile: vi.fn(() => { calls.push('profile'); }),
    replacePlan: vi.fn(() => { calls.push('plan'); }),
  };
}

describe('importAnonymously', () => {
  it('merges entries into the imported plan\'s theatre, replaces the profile, then the plan', () => {
    const t = targets();
    const outcome = importAnonymously(source, { plan: true, entries: true, profile: true }, t);
    expect(t.calls).toEqual(['entries', 'profile', 'plan']);
    expect(t.mergeEntries).toHaveBeenCalledWith('syria', [E1]);
    expect(t.setProfile).toHaveBeenCalledWith(AIRCRAFT);
    expect(outcome).toEqual({ plan: 'done', entries: 'done', profile: 'done' });
  });

  it('drops the plan\'s profileId', () => {
    const t = targets();
    importAnonymously(source, { plan: true, entries: true, profile: true }, t);
    expect((t.replacePlan as any).mock.calls[0][0].profileId).toBeUndefined();
  });

  it('leaves the local profile alone when the profile is deselected', () => {
    const t = targets();
    const outcome = importAnonymously(source, { plan: true, entries: true, profile: false }, t);
    expect(t.setProfile).not.toHaveBeenCalled();
    expect(outcome.profile).toBe('skipped');
  });

  it('adds no entry when library entries are deselected', () => {
    const t = targets();
    importAnonymously(source, { plan: true, entries: false, profile: true }, t);
    expect(t.mergeEntries).not.toHaveBeenCalled();
    expect(t.replacePlan).toHaveBeenCalled();
  });
});
