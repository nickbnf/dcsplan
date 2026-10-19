/** Import preview counts (add-local-data-import task 3.4; spec: plan-import,
 *  *The chooser states what each item would add*). */
import { describe, it, expect } from 'vitest';
import type { LibraryObject } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { computePreview } from './preview';
import type { HeldAssets, ImportSource } from './types';

const entry = (id: string, extra: Partial<LibraryObject> = {}): LibraryObject =>
  ({ id, type: 'sam_site', lat: 42, lon: 41, ...extra });

function held(byTheatre: Record<string, LibraryObject[]>, profileIds: string[] = []): HeldAssets {
  return { entries: t => byTheatre[t] ?? [], hasProfile: id => profileIds.includes(id) };
}

const source = (over: Partial<ImportSource> = {}): ImportSource => ({
  kind: 'file',
  plan: { ...flightPlanUtils.addTurnPoint(flightPlanUtils.newFlightPlan('caucasus'), 42, 41), name: 'Strike North' },
  entries: {},
  profile: null,
  ...over,
});

describe('computePreview', () => {
  it('splits referenced entries into new and already held', () => {
    const incoming = Array.from({ length: 12 }, (_, i) => entry(`e${i}`));
    const preview = computePreview(source({ entries: { caucasus: incoming } }), held({ caucasus: incoming.slice(0, 8) }));
    expect(preview.entries).toEqual({ total: 12, added: 4, kept: 8, differs: 0 });
  });

  it('counts held entries that differ from the source', () => {
    const preview = computePreview(
      source({ entries: { caucasus: [entry('a'), entry('b', { name: 'Renamed' })] } }),
      held({ caucasus: [entry('a'), entry('b')] }),
    );
    expect(preview.entries).toEqual({ total: 2, added: 0, kept: 2, differs: 1 });
  });

  it('compares each theatre against its own library', () => {
    const preview = computePreview(
      source({ entries: { caucasus: [entry('a')], syria: [entry('b')] } }),
      held({ syria: [entry('a')] }),
    );
    expect(preview.entries).toEqual({ total: 2, added: 2, kept: 0, differs: 0 });
  });

  it('reports a profile the destination already holds as present', () => {
    const profile = { id: 'p1', aircraft: { ...defaultAircraft(), model: 'F-16C' } };
    expect(computePreview(source({ profile }), held({}, ['p1'])).profile?.present).toBe(true);
    expect(computePreview(source({ profile }), held({})).profile?.present).toBe(false);
  });

  it('lists only what the source holds', () => {
    const preview = computePreview(source(), held({}));
    expect(preview.plan).toEqual({ name: 'Strike North', theatre: 'caucasus', waypoints: 1 });
    expect(preview.entries).toBeNull();
    expect(preview.profile).toBeNull();
  });
});
