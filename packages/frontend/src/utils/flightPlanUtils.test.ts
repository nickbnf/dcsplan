import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { slugifyPlanName, flightPlanUtils } from './flightPlanUtils';
import type { FlightPlan } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

const makePlan = (overrides: Partial<FlightPlan> = {}): FlightPlan => ({
  theatre: 'syria',
  points: [],
  aircraft: defaultAircraft(),
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test',
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
    const plan = makePlan({
      aircraft: { ...defaultAircraft(), model: 'F-15E Strike Eagle' },
    });
    flightPlanUtils.downloadAircraft(plan);
    expect(capturedFilename).toBe('f-15e-strike-eagle.perf.json');
  });

  it('falls back to performance.json when model is empty', () => {
    const plan = makePlan({ aircraft: { ...defaultAircraft(), model: '' } });
    flightPlanUtils.downloadAircraft(plan);
    expect(capturedFilename).toBe('performance.json');
  });

  it('envelope has version "1.0" and aircraft field', () => {
    const plan = makePlan({
      aircraft: {
        ...defaultAircraft(),
        model: 'F-15E',
        regimes: [{ id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } }],
      },
    });
    flightPlanUtils.downloadAircraft(plan);

    const parsed = JSON.parse(capturedContent);
    expect(parsed.version).toBe('1.0');
    expect(parsed.aircraft).toBeDefined();
    expect(parsed.aircraft.model).toBe('F-15E');
    expect(parsed.aircraft.regimes).toHaveLength(1);
  });

  it('exported object is a deep copy — mutating it does not affect the plan', () => {
    const plan = makePlan({
      aircraft: {
        ...defaultAircraft(),
        model: 'F-15E',
        regimes: [{ id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } }],
      },
    });
    flightPlanUtils.downloadAircraft(plan);

    const exported = JSON.parse(capturedContent);
    exported.aircraft.model = 'MUTATED';
    exported.aircraft.regimes[0].name = 'MUTATED';

    expect(plan.aircraft.model).toBe('F-15E');
    expect(plan.aircraft.regimes[0].name).toBe('Alpha');
  });
});
