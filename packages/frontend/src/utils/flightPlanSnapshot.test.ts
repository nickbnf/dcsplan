import { describe, it, expect } from 'vitest';
import type { FlightPlan, LibraryObject } from '../types/flightPlan';
import { FLIGHT_PLAN_VERSION } from '../types/flightPlan';
import { mergeLibraryEntries } from './libraryStorage';
import { defaultAircraft } from '../types/flightPlan';

const makeEntry = (id: string, overrides: Partial<LibraryObject> = {}): LibraryObject => ({
  id,
  type: 'sam_site',
  lat: 41.0,
  lon: 36.0,
  name: `Entry ${id}`,
  range: 20,
  ...overrides,
});

const makePlan = (overrides: Partial<FlightPlan> = {}): FlightPlan => ({
  theatre: 'caucasus',
  points: [],
  aircraft: defaultAircraft(),
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test',
  ...overrides,
});

describe('snapshot embedding on export', () => {
  it('exports version 1.4', () => {
    expect(FLIGHT_PLAN_VERSION).toBe('1.4');
  });

  it('embeds only referenced library entries', () => {
    const entryA = makeEntry('a');
    const entryB = makeEntry('b');
    const entryC = makeEntry('c');
    const library = [entryA, entryB, entryC];
    const plan = makePlan({ libraryRefs: [{ uuid: 'a' }, { uuid: 'c' }] });

    // Simulate what downloadFlightPlan does
    const referencedIds = new Set((plan.libraryRefs ?? []).map(r => r.uuid));
    const snapshot = library.filter(e => referencedIds.has(e.id));

    expect(snapshot).toHaveLength(2);
    expect(snapshot.map(e => e.id).sort()).toEqual(['a', 'c']);
  });

  it('produces no snapshot when plan has no refs', () => {
    const library = [makeEntry('x')];
    const plan = makePlan(); // no libraryRefs
    const referencedIds = new Set((plan.libraryRefs ?? []).map(r => r.uuid));
    const snapshot = library.filter(e => referencedIds.has(e.id));
    expect(snapshot).toHaveLength(0);
  });

  it('snapshot contains all fields', () => {
    const entry = makeEntry('a', { name: 'SA-6', defaultComment: 'Beware', range: 25 });
    const plan = makePlan({ libraryRefs: [{ uuid: 'a' }] });
    const referencedIds = new Set((plan.libraryRefs ?? []).map(r => r.uuid));
    const snapshot = [entry].filter(e => referencedIds.has(e.id));
    expect(snapshot[0]).toMatchObject({ id: 'a', name: 'SA-6', defaultComment: 'Beware', range: 25 });
  });
});

describe('snapshot merge on import', () => {
  it('adds new UUIDs from snapshot', () => {
    const current = [makeEntry('existing')];
    const snapshot = [makeEntry('new1'), makeEntry('new2')];
    const { merged, added, kept } = mergeLibraryEntries(current, snapshot);
    expect(added).toBe(2);
    expect(kept).toBe(0);
    expect(merged).toHaveLength(3);
  });

  it('existing UUIDs are kept unchanged on import', () => {
    const existing = makeEntry('a', { name: 'Original' });
    const snapshot = [makeEntry('a', { name: 'From file' })];
    const { merged, added, kept } = mergeLibraryEntries([existing], snapshot);
    expect(added).toBe(0);
    expect(kept).toBe(1);
    expect(merged[0].name).toBe('Original');
  });

  it('shows correct counts for mixed snapshot', () => {
    const current = [makeEntry('x'), makeEntry('y')];
    const snapshot = [makeEntry('y'), makeEntry('z')];
    const { added, kept } = mergeLibraryEntries(current, snapshot);
    expect(added).toBe(1);
    expect(kept).toBe(1);
  });
});
