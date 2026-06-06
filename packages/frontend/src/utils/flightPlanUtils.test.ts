import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { slugifyPlanName, flightPlanUtils } from './flightPlanUtils';
import type { Aircraft } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

const makeAircraft = (overrides: Partial<Aircraft> = {}): Aircraft => ({
  ...defaultAircraft(),
  ...overrides,
});

describe('slugifyPlanName', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(slugifyPlanName('F-15E Strike Eagle')).toBe('f-15e-strike-eagle');
  });

  it('collapses consecutive non-alphanumeric runs into single hyphen', () => {
    expect(slugifyPlanName('A  B--C')).toBe('a-b-c');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugifyPlanName(' hello ')).toBe('hello');
  });

  it('returns empty string for empty input', () => {
    expect(slugifyPlanName('')).toBe('');
  });
});

describe('flightPlanUtils.downloadAircraft', () => {
  let capturedContent: string = '';
  let capturedFilename: string = '';

  beforeEach(() => {
    capturedContent = '';
    capturedFilename = '';

    // Capture the Blob content synchronously by intercepting the constructor
    const OriginalBlob = globalThis.Blob;
    vi.stubGlobal('Blob', class MockBlob extends OriginalBlob {
      constructor(parts: BlobPart[], opts?: BlobPropertyBag) {
        super(parts, opts);
        capturedContent = (parts as string[]).join('');
      }
    });

    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:mock-url',
      revokeObjectURL: vi.fn(),
    });

    const mockAnchor = {
      href: '',
      get download() { return capturedFilename; },
      set download(v: string) { capturedFilename = v; },
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor as unknown as HTMLElement;
      return document.createElement.call(document, tag);
    });
    vi.spyOn(document.body, 'appendChild').mockReturnValue(null as any);
    vi.spyOn(document.body, 'removeChild').mockReturnValue(null as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses slugified model name as filename', () => {
    flightPlanUtils.downloadAircraft(makeAircraft({ model: 'F-15E Strike Eagle' }));
    expect(capturedFilename).toBe('f-15e-strike-eagle.perf.json');
  });

  it('falls back to performance.json when model is empty', () => {
    flightPlanUtils.downloadAircraft(makeAircraft({ model: '' }));
    expect(capturedFilename).toBe('performance.json');
  });

  it('envelope has version "1.0" and aircraft field', () => {
    const aircraft = makeAircraft({
      model: 'F-15E',
      regimes: [{ id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } }],
    });
    flightPlanUtils.downloadAircraft(aircraft);

    const parsed = JSON.parse(capturedContent);
    expect(parsed.version).toBe('1.0');
    expect(parsed.aircraft).toBeDefined();
    expect(parsed.aircraft.model).toBe('F-15E');
    expect(parsed.aircraft.regimes).toHaveLength(1);
  });

  it('exported object is a deep copy — mutating it does not affect the aircraft', () => {
    const aircraft = makeAircraft({
      model: 'F-15E',
      regimes: [{ id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } }],
    });
    flightPlanUtils.downloadAircraft(aircraft);

    const exported = JSON.parse(capturedContent);
    exported.aircraft.model = 'MUTATED';
    exported.aircraft.regimes[0].name = 'MUTATED';

    expect(aircraft.model).toBe('F-15E');
    expect(aircraft.regimes[0].name).toBe('Alpha');
  });
});
