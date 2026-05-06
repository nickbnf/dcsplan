import { describe, it, expect } from 'vitest';
import { calculateAllLegData, computeLegSegments, applyWind } from './legCalculations';
import { get as getProjection } from 'ol/proj';
import type { FlightPlan, Regime } from '../types/flightPlan';
// LegSegmentsResult types are in flightPlan.ts and re-exported from legCalculations.ts

// Use EPSG:4326 as a simple projection for testing
const projection = getProjection('EPSG:4326')!;
const navigationMode = 'projected';

// Helper: build a minimal flight plan
function makePlan(overrides: Partial<FlightPlan> = {}): FlightPlan {
  return {
    theatre: 'test',
    points: [],
    regimes: [],
    declination: 0,
    bankAngle: 45,
    initTimeSec: 12 * 3600, // 12:00:00
    initFob: 10000,
    name: 'Test',
    ...overrides,
  };
}

// Helper: build a waypoint at a given position
function makePoint(lat: number, lon: number, overrides: Record<string, any> = {}) {
  return {
    lat,
    lon,
    tas: 400,
    alt: 20000,
    fuelFlow: 3600, // 3600 pph = 1 lb/sec for easy math
    windSpeed: 0,
    windDir: 0,
    ...overrides,
  };
}

describe('calculateAllLegData with Push waypoints', () => {
  it('uses exit time instead of ETA for legs after a Push point', () => {
    // WP1 -> WP2 (Push, exit 30 min after plan start) -> WP3
    // With exit time later than arrival, WP3 ETA should be based on exit time
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, {
          waypointType: 'push',
          exitTimeSec: 12 * 3600 + 30 * 60, // 12:30:00
        }),
        makePoint(0, 2),
      ],
    });

    const legs = calculateAllLegData(plan, projection, navigationMode);
    expect(legs).toHaveLength(2);

    // const leg1 = legs[0]; // WP1 -> WP2 (Push)
    const leg2 = legs[1]; // WP2 (Push) -> WP3

    // Leg 2 ETA should be exit time + leg2 ETE (not leg1 ETA + leg2 ETE)
    const exitTime = 12 * 3600 + 30 * 60;
    expect(leg2.eta).toBe(exitTime + leg2.ete);
  });

  it('deducts wait fuel from EFR at the Push point', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, {
          waypointType: 'push',
          exitTimeSec: 12 * 3600 + 30 * 60, // 12:30:00
          fuelFlow: 3600, // 1 lb/sec
        }),
        makePoint(0, 2),
      ],
    });

    const legs = calculateAllLegData(plan, projection, navigationMode);
    const leg1 = legs[0]; // arrives at Push point

    // Wait time = exit time - arrival ETA
    const waitTimeSec = (12 * 3600 + 30 * 60) - leg1.eta;
    // Wait fuel = waitTime * fuelFlow/3600 = waitTime * 1 lb/sec
    const waitFuel = waitTimeSec * (3600 / 3600);

    // EFR should be arrival fuel minus wait fuel
    // Arrival fuel = initFob - leg travel fuel
    const travelFuel = leg1.ete * (3600 / 3600);
    const expectedEfr = 10000 - travelFuel - waitFuel;
    expect(leg1.efr).toBeCloseTo(expectedEfr, 1);
  });

  it('includes wait fuel in legFuel for the leg arriving at Push point', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, {
          waypointType: 'push',
          exitTimeSec: 12 * 3600 + 30 * 60,
          fuelFlow: 3600,
        }),
        makePoint(0, 2),
      ],
    });

    const legs = calculateAllLegData(plan, projection, navigationMode);
    const leg1 = legs[0];

    // legFuel should include both travel fuel and wait fuel
    const travelFuel = leg1.ete * (3600 / 3600);
    const waitTimeSec = (12 * 3600 + 30 * 60) - leg1.eta;
    const waitFuel = waitTimeSec * (3600 / 3600);
    expect(leg1.legFuel).toBeCloseTo(travelFuel + waitFuel, 1);
  });

  it('cascades reduced EFR to waypoints after the Push point', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, {
          waypointType: 'push',
          exitTimeSec: 12 * 3600 + 30 * 60,
          fuelFlow: 3600,
        }),
        makePoint(0, 2, { fuelFlow: 3600 }),
      ],
    });

    const legs = calculateAllLegData(plan, projection, navigationMode);
    const leg1 = legs[0]; // WP1 -> Push
    const leg2 = legs[1]; // Push -> WP3

    // WP3 EFR should be Push EFR minus leg2 fuel
    const leg2Fuel = leg2.ete * (3600 / 3600);
    expect(leg2.efr).toBeCloseTo(leg1.efr - leg2Fuel, 1);
  });

  it('does not add wait fuel when exit time equals ETA', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, {
          waypointType: 'push',
          // exitTimeSec undefined → defaults to ETA, so wait = 0
        }),
        makePoint(0, 2),
      ],
    });

    const legs = calculateAllLegData(plan, projection, navigationMode);
    const leg1 = legs[0];

    // No wait fuel: legFuel should equal travel fuel only
    const travelFuel = leg1.ete * (3600 / 3600);
    expect(leg1.legFuel).toBeCloseTo(travelFuel, 1);
  });

  it('clamps exit time to ETA when stored exit time is earlier', () => {
    // Simulate stale exit time that's before the actual ETA
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, {
          waypointType: 'push',
          exitTimeSec: 0, // way before ETA
          fuelFlow: 3600,
        }),
        makePoint(0, 2),
      ],
    });

    const legs = calculateAllLegData(plan, projection, navigationMode);
    const leg1 = legs[0];

    // Exit time clamped to ETA → no wait fuel
    const travelFuel = leg1.ete * (3600 / 3600);
    expect(leg1.legFuel).toBeCloseTo(travelFuel, 1);
    // EFR = just travel fuel deducted
    expect(leg1.efr).toBeCloseTo(10000 - travelFuel, 1);
  });

  it('does not affect normal waypoints', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1), // normal waypoint
        makePoint(0, 2),
      ],
    });

    const legs = calculateAllLegData(plan, projection, navigationMode);
    const leg1 = legs[0];
    const leg2 = legs[1];

    // No wait fuel for normal waypoints
    const travel1 = leg1.ete * (3600 / 3600);
    expect(leg1.legFuel).toBeCloseTo(travel1, 1);

    // Leg 2 ETA should be leg1 ETA + leg2 ETE
    expect(leg2.eta).toBe(leg1.eta + leg2.ete);
  });
});

// --- computeLegSegments tests ---

const noWind = { windSpeed: 0, windDir: 0 };

function makeRegime(overrides: Partial<Regime> = {}): Regime {
  return {
    id: 'r1',
    name: 'Test Regime',
    cruise: { tas: 400, ff: 3600 },
    ...overrides,
  };
}

describe('computeLegSegments', () => {
  it('level leg manual (no regime): returns level with stored tas/ff', () => {
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    });
    expect(result.kind).toBe('level');
    if (result.kind === 'level') {
      expect(result.tas).toBe(400);
      expect(result.ff).toBe(3600);
    }
  });

  it('level leg with regime (altDelta=0): returns level using stored tas/ff', () => {
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, makeRegime());
    expect(result.kind).toBe('level');
  });

  it('climbing leg with full climb data: returns segmented result', () => {
    const regime = makeRegime({ climb: { tas: 300, ff: 4000, roc: 2000 } });
    // altDelta = 10000 ft, roc = 2000 fpm → transitionTime = 5 min
    // transitionGroundSpeed = 300 kts (no wind), transitionDistance = 300 * (5/60) = 25 nm
    // distance = 50 nm → fits; cruiseDistance = 25 nm
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime);
    expect(result.kind).toBe('segmented');
    if (result.kind === 'segmented') {
      expect(result.transition.phase).toBe('climb');
      expect(result.transition.time).toBeCloseTo(5, 5);
      expect(result.transition.distance).toBeCloseTo(25, 5);
      expect(result.transition.fuel).toBeCloseTo(4000 * (5 / 60), 4);
      expect(result.cruise.distance).toBeCloseTo(25, 5);
    }
  });

  it('climbing leg without climb data: falls back to cruise (level)', () => {
    const regime = makeRegime(); // no climb data
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime);
    expect(result.kind).toBe('level');
  });

  it('descending leg with full descent data: returns segmented result', () => {
    const regime = makeRegime({ descent: { tas: 300, ff: 2000, rod: 2000 } });
    // altDelta = -10000 ft, rod = 2000 fpm → transitionTime = 5 min
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 0, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime);
    expect(result.kind).toBe('segmented');
    if (result.kind === 'segmented') {
      expect(result.transition.phase).toBe('descent');
      expect(result.transition.time).toBeCloseTo(5, 5);
    }
  });

  it('descending leg without descent data: falls back to cruise (level)', () => {
    const regime = makeRegime(); // no descent data
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 0, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime);
    expect(result.kind).toBe('level');
  });

  it('manual leg with alt delta: returns level (no regime)', () => {
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    });
    expect(result.kind).toBe('level');
    if (result.kind === 'level') {
      expect(result.tas).toBe(400);
    }
  });

  it('over-long climb fires warning', () => {
    const regime = makeRegime({ climb: { tas: 300, ff: 4000, roc: 2000 } });
    // altDelta = 30000 ft, roc = 2000 fpm → transitionTime = 15 min
    // transitionDistance = 300 * (15/60) = 75 nm > 50 nm → warning
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 30000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime);
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toBe('transition-too-long');
      expect(result.transitionDistance).toBeGreaterThan(50);
      // reachableAltDelta should be positive (climbing)
      expect(result.reachableAltDelta).toBeGreaterThan(0);
    }
  });

  it('over-long descent fires warning', () => {
    const regime = makeRegime({ descent: { tas: 300, ff: 2000, rod: 2000 } });
    // altDelta = -30000 ft → transitionDistance = 75 nm > 50 nm → warning
    const result = computeLegSegments({
      prevAlt: 30000, legAlt: 0, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime);
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      // reachableAltDelta should be negative (descending)
      expect(result.reachableAltDelta).toBeLessThan(0);
    }
  });

  it('level leg with no regime unchanged from pre-feature', () => {
    // Without regime, a level leg should give the same ETE as the direct formula
    const tas = 400;
    const distance = 50;
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance, course: 90,
      windA: noWind, windB: noWind, tas, ff: 3600,
    });
    expect(result.kind).toBe('level');
    if (result.kind === 'level') {
      const gs = applyWind(result.tas, 0, 0, 90);
      const eteSec = Math.round(distance / gs * 3600);
      expect(eteSec).toBe(Math.round(distance / tas * 3600));
    }
  });
});
