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

// --- addTurnPoint groundAlt / no-backfill tests ---

function makePlan() {
  return flightPlanUtils.newFlightPlan('syria');
}

function addWP(plan: ReturnType<typeof flightPlanUtils.newFlightPlan>, lat = 0, lon = 0) {
  return flightPlanUtils.addTurnPoint(plan, lat, lon);
}

describe('flightPlanUtils.addTurnPoint — groundAlt and no-backfill', () => {
  it('first waypoint added has groundAlt = 0', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    expect(plan.points[0].groundAlt).toBe(0);
  });

  it('second waypoint added also has groundAlt = 0', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    plan = addWP(plan, 0, 1);
    expect(plan.points[1].groundAlt).toBe(0);
  });

  it('appending a waypoint removes groundAlt from the previously-last waypoint', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    // first WP has groundAlt=0
    plan = addWP(plan, 0, 1);
    // WP0 is now interior — its groundAlt should be removed
    expect(plan.points[0].groundAlt).toBeUndefined();
  });

  it('adding a waypoint does not mutate prior waypoints\' planning fields', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    plan = flightPlanUtils.updateTurnPoint(plan, 0, { tas: 500, alt: 8000, fuelFlow: 4000 });
    const snapTas = plan.points[0].tas;
    const snapAlt = plan.points[0].alt;
    const snapFf = plan.points[0].fuelFlow;

    plan = addWP(plan, 0, 1);

    expect(plan.points[0].tas).toBe(snapTas);
    expect(plan.points[0].alt).toBe(snapAlt);
    expect(plan.points[0].fuelFlow).toBe(snapFf);
  });
});

// --- insertTurnPointAtMidpoint — copies from destination ---

describe('flightPlanUtils.insertTurnPointAtMidpoint — inherits from destination', () => {
  it('new midpoint waypoint has alt from destination', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    plan = addWP(plan, 0, 2);
    plan = flightPlanUtils.updateTurnPoint(plan, 0, { alt: 3000 });
    plan = flightPlanUtils.updateTurnPoint(plan, 1, { alt: 9000 });

    plan = flightPlanUtils.insertTurnPointAtMidpoint(plan, 0);
    // New WP at index 1 (between old WP0 and WP1) should have alt = destination (9000)
    expect(plan.points[1].alt).toBe(9000);
  });

  it('new midpoint waypoint has tas and fuelFlow from destination', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    plan = addWP(plan, 0, 2);
    plan = flightPlanUtils.updateTurnPoint(plan, 0, { tas: 300, fuelFlow: 4000 });
    plan = flightPlanUtils.updateTurnPoint(plan, 1, { tas: 450, fuelFlow: 7000 });

    plan = flightPlanUtils.insertTurnPointAtMidpoint(plan, 0);
    expect(plan.points[1].tas).toBe(450);
    expect(plan.points[1].fuelFlow).toBe(7000);
  });

  it('midpoint insert does not set groundAlt on the new waypoint', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    plan = addWP(plan, 0, 2);

    plan = flightPlanUtils.insertTurnPointAtMidpoint(plan, 0);
    expect(plan.points[1].groundAlt).toBeUndefined();
  });

  it('midpoint insert copies regimeId from destination', () => {
    let plan = makePlan();
    plan = addWP(plan, 0, 0);
    plan = addWP(plan, 0, 2);
    plan = flightPlanUtils.updateTurnPoint(plan, 0, { regimeId: 'r-origin' });
    plan = flightPlanUtils.updateTurnPoint(plan, 1, { regimeId: 'r-dest' });

    plan = flightPlanUtils.insertTurnPointAtMidpoint(plan, 0);
    expect(plan.points[1].regimeId).toBe('r-dest');
  });
});
