import { describe, it, expect } from 'vitest';
import { calculateAllLegData, computeLegSegments, applyWind } from './legCalculations';
import { get as getProjection } from 'ol/proj';
import type { FlightPlan, Aircraft, Regime } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';
// LegSegmentsResult types are in flightPlan.ts and re-exported from legCalculations.ts

// Use EPSG:4326 as a simple projection for testing
const projection = getProjection('EPSG:4326')!;
const navigationMode = 'projected';

// Helper: build a minimal flight plan (no aircraft field — passed separately to calculateAllLegData)
function makePlan(overrides: Partial<FlightPlan> = {}): FlightPlan {
  return {
    theatre: 'test',
    points: [],
    declination: 0,
    bankAngle: 45,
    initTimeSec: 12 * 3600, // 12:00:00
    initFob: 10000,
    name: 'Test',
    ...overrides,
  };
}

function makeAircraft(overrides: Partial<Aircraft> & { regimes?: Regime[] } = {}): Aircraft {
  return { ...defaultAircraft(), ...overrides };
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

    const legs = calculateAllLegData(plan, projection, navigationMode, defaultAircraft());
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

    const legs = calculateAllLegData(plan, projection, navigationMode, defaultAircraft());
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

    const legs = calculateAllLegData(plan, projection, navigationMode, defaultAircraft());
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

    const legs = calculateAllLegData(plan, projection, navigationMode, defaultAircraft());
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

    const legs = calculateAllLegData(plan, projection, navigationMode, defaultAircraft());
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

    const legs = calculateAllLegData(plan, projection, navigationMode, defaultAircraft());
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

    const legs = calculateAllLegData(plan, projection, navigationMode, defaultAircraft());
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

  // --- Take-off segment tests (task 3.6) ---

  const regime3Phase = makeRegime({ climb: { tas: 300, ff: 4000, roc: 2000 } });
  const takeoffBlock = { timeSec: 75, fuel: 250, distance: 1.8 };
  // TAS_to = 1.8 / (75/3600) = 86.4 kts

  it('leg 0 with active T/O and climb yields 3-phase segmented result', () => {
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, regime3Phase);
    expect(result.kind).toBe('segmented');
    if (result.kind === 'segmented') {
      expect(result.takeoff).toBeDefined();
      expect(result.takeoff!.time).toBeCloseTo(75 / 60, 5);
      expect(result.takeoff!.fuel).toBe(250);
      expect(result.transition.phase).toBe('climb');
      expect(result.cruise.distance).toBeGreaterThan(0);
    }
  });

  it('leg 0 with active T/O and no climb yields T/O + cruise', () => {
    const regimeCruiseOnly = makeRegime(); // no climb
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, regimeCruiseOnly);
    expect(result.kind).toBe('segmented');
    if (result.kind === 'segmented') {
      expect(result.takeoff).toBeDefined();
      expect(result.transition.time).toBe(0);
    }
  });

  it('leg 0 with regime but takeoff = {0,0,0} returns same as 2-phase', () => {
    const zeroTO = { timeSec: 0, fuel: 0, distance: 0 };
    const r1 = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: zeroTO,
    }, regime3Phase);
    const r2 = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime3Phase);
    expect(r1.kind).toBe(r2.kind);
    if (r1.kind === 'segmented' && r2.kind === 'segmented') {
      expect(r1.takeoff).toBeUndefined();
      expect(r1.transition.time).toBeCloseTo(r2.transition.time, 5);
    }
  });

  it('leg 0 in Manual mode (no regime) skips T/O even when takeoff is set', () => {
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }); // no regime
    expect(result.kind).toBe('level');
  });

  it('leg 1 (index >= 1) ignores takeoff regardless', () => {
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 1, takeoff: takeoffBlock,
    }, regime3Phase);
    // Should be same as without T/O
    const noTO = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
    }, regime3Phase);
    expect(result.kind).toBe(noTO.kind);
    if (result.kind === 'segmented' && noTO.kind === 'segmented') {
      expect(result.takeoff).toBeUndefined();
    }
  });

  it('T/O time is verbatim (75s) regardless of wind', () => {
    const headwind = { windSpeed: 20, windDir: 0 }; // direct headwind on course 0
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: headwind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, makeRegime());
    expect(result.kind).toBe('segmented');
    if (result.kind === 'segmented') {
      expect(result.takeoff!.time).toBeCloseTo(75 / 60, 5);
      expect(result.takeoff!.fuel).toBe(250);
    }
  });

  it('T/O ground distance shrinks with headwind', () => {
    const noWindResult = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, makeRegime());
    const headwindResult = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: { windSpeed: 20, windDir: 0 }, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, makeRegime());
    if (noWindResult.kind === 'segmented' && headwindResult.kind === 'segmented') {
      expect(headwindResult.takeoff!.distance).toBeLessThan(noWindResult.takeoff!.distance);
    }
  });

  it('T/O ground distance grows with tailwind', () => {
    const noWindResult = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, makeRegime());
    const tailwindResult = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: { windSpeed: 20, windDir: 180 }, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, makeRegime());
    if (noWindResult.kind === 'segmented' && tailwindResult.kind === 'segmented') {
      expect(tailwindResult.takeoff!.distance).toBeGreaterThan(noWindResult.takeoff!.distance);
    }
  });

  it('warning fires when T/O + climb > leg_distance', () => {
    // T/O distance (no wind) ≈ 1.8 nm, climb needs 25 nm, total 26.8 > 20 nm
    const smallDist = 20;
    const result = computeLegSegments({
      prevAlt: 0, legAlt: 10000, distance: smallDist, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, regime3Phase);
    expect(result.kind).toBe('warning');
  });

  it('warning fires when T/O distance alone > leg_distance (no climb)', () => {
    // T/O block with large distance > leg
    const bigTO = { timeSec: 300, fuel: 500, distance: 10 };
    // TAS_to = 10 / (300/3600) = 120 kts → ground dist = 120 * 300/3600 = 10 nm
    // leg = 5 nm → warning
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 5, course: 0,
      windA: noWind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: bigTO,
    }, makeRegime()); // no climb
    expect(result.kind).toBe('warning');
  });

  it('T/O ground distance is wind-corrected with 20-kt headwind', () => {
    // TAS_to = 1.8 / (75/3600) = 86.4 kts
    // GS_to = 86.4 - 20 = 66.4 kts (headwind on course 0, wind from 0)
    // ground dist = 66.4 * (75/3600) ≈ 1.383 nm
    const headwind = { windSpeed: 20, windDir: 0 };
    const result = computeLegSegments({
      prevAlt: 10000, legAlt: 10000, distance: 50, course: 0,
      windA: headwind, windB: noWind, tas: 400, ff: 3600,
      legIndex: 0, takeoff: takeoffBlock,
    }, makeRegime());
    expect(result.kind).toBe('segmented');
    if (result.kind === 'segmented') {
      expect(result.takeoff!.distance).toBeCloseTo(1.383, 2);
    }
  });
});

// --- Taxi fuel in EFR chain (task 4.3) ---

describe('calculateAllLegData — taxi fuel', () => {
  it('taxiFuel = 0 reproduces pre-change EFR exactly', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, { fuelFlow: 3600 }),
      ],
    });
    const legs = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ taxiFuel: 0 }));
    const leg = legs[0];
    const expectedEfr = 10000 - leg.legFuel;
    expect(leg.efr).toBeCloseTo(expectedEfr, 2);
  });

  it('taxiFuel = 400 reduces waypoint-1 EFR by 400 lbs', () => {
    const plan = makePlan({
      points: [makePoint(0, 0), makePoint(0, 1, { fuelFlow: 3600 })],
    });
    const legsA = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ taxiFuel: 0 }));
    const legsB = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ taxiFuel: 400 }));
    expect(legsB[0].efr).toBeCloseTo(legsA[0].efr - 400, 2);
  });

  it('taxiFuel does not appear as recurring deduction on legs 2..N', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0),
        makePoint(0, 1, { fuelFlow: 3600 }),
        makePoint(0, 2, { fuelFlow: 3600 }),
      ],
    });
    const legs = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ taxiFuel: 400 }));
    // EFR at wp2 should be (EFR at wp1) - leg2Fuel, not (EFR at wp1) - 400 - leg2Fuel
    const expectedEfr2 = legs[0].efr - legs[1].legFuel;
    expect(legs[1].efr).toBeCloseTo(expectedEfr2, 2);
  });
});

// --- leg-0 groundAlt tests ---
// Strategy: use level/non-level outcomes to verify prevAlt selection
// without depending on leg distance (which is tiny in EPSG:4326 projected mode).
// If groundAlt == WP1.alt → altDelta=0 → 'level'.  If alt were used instead → altDelta≠0 → not 'level'.

describe('calculateAllLegData leg-0 groundAlt', () => {
  const fullRegime: Regime = {
    id: 'r1',
    name: 'Test',
    cruise: { tas: 400, ff: 3600 },
    climb: { tas: 300, ff: 4000, roc: 2000 },
    descent: { tas: 300, ff: 2000, rod: 2000 },
  };

  it('(a) leg 0 uses groundAlt as start altitude, not alt', () => {
    // WP0: alt=3000 (phantom), groundAlt=5000. WP1: alt=5000.
    // Using groundAlt: altDelta = 5000 - 5000 = 0 → level.
    // Using alt: altDelta = 5000 - 3000 = 2000 → segmented climb.
    const plan = makePlan({
      points: [
        makePoint(0, 0, { alt: 3000, groundAlt: 5000 }),
        makePoint(0, 1, { alt: 5000, regimeId: 'r1' }),
      ],
    });
    const legs = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ regimes: [fullRegime] }));
    expect(legs[0].segmentsResult?.kind).toBe('level');
  });

  it('(b) undefined groundAlt on leg 0 treats start altitude as 0', () => {
    // WP0: alt=5000, no groundAlt → treated as 0. WP1: alt=0.
    // Using groundAlt=0: altDelta = 0 - 0 = 0 → level.
    // Using alt=5000: altDelta = 0 - 5000 = -5000 → segmented descent.
    const plan = makePlan({
      points: [
        makePoint(0, 0, { alt: 5000 }), // no groundAlt
        makePoint(0, 1, { alt: 0, regimeId: 'r1' }),
      ],
    });
    const legs = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ regimes: [fullRegime] }));
    expect(legs[0].segmentsResult?.kind).toBe('level');
  });

  it('(c) leg 0 with groundAlt = WP1.alt is level', () => {
    const plan = makePlan({
      points: [
        makePoint(0, 0, { groundAlt: 5000, alt: 3000 }),
        makePoint(0, 1, { alt: 5000, regimeId: 'r1' }),
      ],
    });
    const legs = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ regimes: [fullRegime] }));
    expect(legs[0].segmentsResult?.kind).toBe('level');
  });

  it('(d) WP0.alt ≠ WP0.groundAlt: groundAlt wins for leg 0', () => {
    // WP0: alt=8000 (phantom), groundAlt=5000. WP1: alt=5000.
    // Using groundAlt=5000: altDelta = 0 → level.
    // Using alt=8000: altDelta = -3000 → segmented descent.
    const plan = makePlan({
      points: [
        makePoint(0, 0, { alt: 8000, groundAlt: 5000 }),
        makePoint(0, 1, { alt: 5000, regimeId: 'r1' }),
      ],
    });
    const legs = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ regimes: [fullRegime] }));
    expect(legs[0].segmentsResult?.kind).toBe('level');
  });

  it('(e) legs 2..N use origin.alt as prevAlt, not groundAlt', () => {
    // WP1 is interior: alt=5000, groundAlt=9000 (should be ignored for leg 1→2).
    // WP2: alt=5000. Using alt=5000: altDelta=0 → level. Using groundAlt=9000: altDelta=-4000 → descent.
    const plan = makePlan({
      points: [
        makePoint(0, 0, { groundAlt: 0 }),
        makePoint(0, 1, { alt: 5000, groundAlt: 9000 }),
        makePoint(0, 2, { alt: 5000, regimeId: 'r1' }),
      ],
    });
    const legs = calculateAllLegData(plan, projection, navigationMode, makeAircraft({ regimes: [fullRegime] }));
    expect(legs[1].segmentsResult?.kind).toBe('level');
  });
});
