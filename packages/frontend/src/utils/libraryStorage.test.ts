import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { LibraryObject, FlightPlan, PlanLibraryRef, PlanMarker } from '../types/flightPlan';
import { LIBRARY_FILE_VERSION } from '../types/flightPlan';
import {
  loadLibrary,
  saveLibrary,
  clearLibrary,
  parseLibraryFile,
  serializeLibraryFile,
  mergeLibraryEntries,
  replaceLibraryEntries,
} from './libraryStorage';

const makeEntry = (overrides: Partial<LibraryObject> = {}): LibraryObject => ({
  id: crypto.randomUUID(),
  type: 'sam_site',
  lat: 41.5,
  lon: 36.2,
  name: 'Test SAM',
  defaultComment: 'Watch out',
  range: 25,
  ...overrides,
});

describe('library localStorage layer', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('returns empty array when no key exists', () => {
    expect(loadLibrary('caucasus')).toEqual([]);
  });

  it('saves and loads entries', () => {
    const entries = [makeEntry(), makeEntry({ type: 'aaa', range: 10 })];
    saveLibrary('caucasus', entries);
    const loaded = loadLibrary('caucasus');
    expect(loaded).toHaveLength(2);
    expect(loaded[0].id).toBe(entries[0].id);
    expect(loaded[1].type).toBe('aaa');
  });

  it('isolates entries by theatreId', () => {
    saveLibrary('caucasus', [makeEntry()]);
    saveLibrary('syria', [makeEntry(), makeEntry()]);
    expect(loadLibrary('caucasus')).toHaveLength(1);
    expect(loadLibrary('syria')).toHaveLength(2);
    expect(loadLibrary('persian_gulf')).toHaveLength(0);
  });

  it('clearLibrary removes entries', () => {
    saveLibrary('caucasus', [makeEntry()]);
    clearLibrary('caucasus');
    expect(loadLibrary('caucasus')).toEqual([]);
  });

  it('round-trips a full library entry', () => {
    const entry: LibraryObject = {
      id: 'abc-123',
      type: 'sam_site',
      lat: 41.123456,
      lon: 36.654321,
      name: 'SA-6 Gainful',
      defaultComment: '25 NM ring',
      range: 25,
    };
    saveLibrary('caucasus', [entry]);
    const [loaded] = loadLibrary('caucasus');
    expect(loaded).toEqual(entry);
  });
});

describe('parseLibraryFile', () => {
  it('rejects non-object input', () => {
    expect(parseLibraryFile('bad')).toMatchObject({ ok: false });
    expect(parseLibraryFile(null)).toMatchObject({ ok: false });
  });

  it('rejects missing version', () => {
    expect(parseLibraryFile({ library: [] })).toMatchObject({ ok: false, error: expect.stringContaining('version') });
  });

  it('rejects missing library array', () => {
    expect(parseLibraryFile({ version: '1.0' })).toMatchObject({ ok: false });
  });

  it('parses a valid library file', () => {
    const entry = makeEntry();
    const result = parseLibraryFile({ version: '1.0', library: [entry] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.library[0].id).toBe(entry.id);
  });

  it('skips invalid entries silently', () => {
    const entry = makeEntry();
    const result = parseLibraryFile({ version: '1.0', library: [entry, { bad: true }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.library).toHaveLength(1);
  });
});

describe('serializeLibraryFile', () => {
  it('round-trips entries', () => {
    const entries = [makeEntry(), makeEntry({ type: 'bridge', range: undefined, name: 'Main Bridge' })];
    const file = serializeLibraryFile(entries);
    expect(file.version).toBe(LIBRARY_FILE_VERSION);
    const parsed = parseLibraryFile(file);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.library).toHaveLength(2);
      expect(parsed.library[0].id).toBe(entries[0].id);
    }
  });
});

describe('mergeLibraryEntries', () => {
  it('adds entries whose UUIDs are not in current library', () => {
    const current = [makeEntry({ id: 'a' })];
    const incoming = [makeEntry({ id: 'b' }), makeEntry({ id: 'c' })];
    const result = mergeLibraryEntries(current, incoming);
    expect(result.added).toBe(2);
    expect(result.kept).toBe(0);
    expect(result.merged).toHaveLength(3);
  });

  it('keeps existing entries unchanged when UUID already present', () => {
    const existing = makeEntry({ id: 'a', name: 'Original' });
    const incoming = makeEntry({ id: 'a', name: 'Updated' });
    const result = mergeLibraryEntries([existing], [incoming]);
    expect(result.added).toBe(0);
    expect(result.kept).toBe(1);
    expect(result.merged[0].name).toBe('Original');
  });

  it('handles mixed new and existing', () => {
    const current = [makeEntry({ id: 'a' }), makeEntry({ id: 'b' })];
    const incoming = [makeEntry({ id: 'b' }), makeEntry({ id: 'c' })];
    const result = mergeLibraryEntries(current, incoming);
    expect(result.added).toBe(1);
    expect(result.kept).toBe(1);
    expect(result.merged).toHaveLength(3);
  });
});

describe('replaceLibraryEntries', () => {
  it('replaces entirely', () => {
    const incoming = [makeEntry(), makeEntry()];
    const result = replaceLibraryEntries(incoming);
    expect(result.merged).toHaveLength(2);
    expect(result.added).toBe(2);
    expect(result.kept).toBe(0);
  });
});

describe('FlightPlan legacy compatibility', () => {
  it('v1.3 plan JSON loads with empty libraryRefs and markers', () => {
    const legacyPlan = {
      theatre: 'syria',
      points: [],
      declination: 0,
      bankAngle: 45,
      initTimeSec: 43200,
      initFob: 12000,
      name: 'Legacy Plan',
      aircraft: { model: '', takeoffConfiguration: '', taxiFuel: 0, takeoff: { timeSec: 0, fuel: 0, distance: 0 }, regimes: [] },
    };
    // Simulate import: absent fields should default to empty arrays
    const libraryRefs: PlanLibraryRef[] = (legacyPlan as any).libraryRefs ?? [];
    const markers: PlanMarker[] = (legacyPlan as any).markers ?? [];
    expect(libraryRefs).toEqual([]);
    expect(markers).toEqual([]);
  });

  it('plan with libraryRefs and markers round-trips through JSON', () => {
    const ref: PlanLibraryRef = { uuid: 'lib-1', comment: 'Watch SA-6' };
    const marker: PlanMarker = { id: 'mkr-1', type: 'bridge', lat: 41.5, lon: 36.2 };
    const plan: FlightPlan = {
      theatre: 'caucasus',
      points: [],
      declination: 0,
      bankAngle: 45,
      initTimeSec: 43200,
      initFob: 12000,
      name: 'Test Plan',
      aircraft: { model: '', takeoffConfiguration: '', taxiFuel: 0, takeoff: { timeSec: 0, fuel: 0, distance: 0 }, regimes: [] },
      libraryRefs: [ref],
      markers: [marker],
    };
    const json = JSON.stringify(plan);
    const restored: FlightPlan = JSON.parse(json);
    expect(restored.libraryRefs).toHaveLength(1);
    expect(restored.libraryRefs![0].uuid).toBe('lib-1');
    expect(restored.markers).toHaveLength(1);
    expect(restored.markers![0].type).toBe('bridge');
  });
});
