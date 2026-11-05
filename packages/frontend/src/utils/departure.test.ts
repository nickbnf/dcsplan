import { describe, it, expect } from 'vitest';
import { get as getProjection, transform } from 'ol/proj';
import {
  buildDeparturePath, departureSchedule, departureTiming, scheduleAirDistanceNm, scheduleTasAt,
  straightOutDistanceNm,
} from './departure';
import { calculateStraighteningPoint, calculateTurnRadius } from './legCalculations';
import type { Aircraft, FlightPlan, FlightPlanTurnPoint, Regime } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

// Web Mercator near the equator: projected metres are ground metres.
const projection = getProjection('EPSG:3857')!;
const NM = 1852;

/** Lat/lon of a point `nm` NM from (0,0) on grid bearing `brg`. */
function at(nm: number, brg: number): { lat: number; lon: number } {
  const r = brg * Math.PI / 180;
  const [lon, lat] = transform([nm * NM * Math.sin(r), nm * NM * Math.cos(r)], 'EPSG:3857', 'EPSG:4326');
  return { lat, lon };
}

function xy(lat: number, lon: number): [number, number] {
  return transform([lon, lat], 'EPSG:4326', 'EPSG:3857') as [number, number];
}

function wpt(id: string, pos: { lat: number; lon: number }, overrides: Partial<FlightPlanTurnPoint> = {}): FlightPlanTurnPoint {
  return { id, ...pos, tas: 400, alt: 0, fuelFlow: 3600, windSpeed: 0, windDir: 0, ...overrides };
}

function plan(wp1: { lat: number; lon: number }, wp1Overrides: Partial<FlightPlanTurnPoint> = {}, groundAlt = 0): FlightPlan {
  return {
    theatre: 'syria',
    points: [wpt('a', at(0, 0), { groundAlt, runway: 27 }), wpt('b', wp1, wp1Overrides)],
    declination: 0,
    bankAngle: 30,
    initTimeSec: 0,
    initFob: 10000,
    name: 'Departure',
  };
}

const climbRegime: Regime = { id: 'r1', name: 'Climb', cruise: { tas: 450, ff: 4000 }, climb: { tas: 300, ff: 8000, roc: 4000 } };

function aircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return { ...defaultAircraft(), regimes: [climbRegime], ...overrides };
}

function build(p: FlightPlan, ac: Aircraft, straightOutNm = 2) {
  return buildDeparturePath({
    origin: p.points[0], destination: p.points[1], runwayTrue: 270, straightOutNm,
    schedule: departureSchedule(p, ac), bankAngle: p.bankAngle, projection,
  });
}

describe('straightOutDistanceNm', () => {
  it('defaults to 2 NM and uses the profile value when set', () => {
    expect(straightOutDistanceNm(defaultAircraft())).toBe(2);
    expect(straightOutDistanceNm({ ...defaultAircraft(), straightOutDistance: 3.5 })).toBe(3.5);
  });
});

describe('departureSchedule', () => {
  const climbing = plan(at(30, 90), { regimeId: 'r1', alt: 20000 });

  it('fits p = 1 (linear acceleration) when D = Vc·T/2', () => {
    const s = departureSchedule(climbing, aircraft({ takeoff: { timeSec: 60, fuel: 200, distance: 2.5 } }));
    expect(scheduleTasAt(s, 0)).toBe(0);
    expect(scheduleTasAt(s, 30)).toBeCloseTo(150, 9);
    expect(scheduleTasAt(s, 59.999)).toBeCloseTo(300, 1);
    expect(scheduleTasAt(s, 60)).toBe(300);
  });

  it('covers exactly the take-off distance over the take-off phase', () => {
    const s = departureSchedule(climbing, aircraft({ takeoff: { timeSec: 75, fuel: 250, distance: 1.8 } }));
    expect(Math.abs(scheduleAirDistanceNm(s, 0, 75) - 1.8) * NM).toBeLessThan(1);
  });

  it('falls back to a constant D/T when D ≥ Vc·T', () => {
    const s = departureSchedule(climbing, aircraft({ takeoff: { timeSec: 60, fuel: 200, distance: 6 } }));
    expect(scheduleTasAt(s, 1)).toBeCloseTo(360, 9);
    expect(scheduleTasAt(s, 59)).toBeCloseTo(360, 9);
  });

  it('starts at climb TAS when the take-off block is all zero', () => {
    const s = departureSchedule(climbing, aircraft());
    expect(s.takeoffEndSec).toBe(0);
    expect(scheduleTasAt(s, 0)).toBe(300);
    expect(s.transitionEndSec).toBeCloseTo(300, 9); // 20000 ft at 4000 fpm
    expect(scheduleTasAt(s, 301)).toBe(450);
  });

  it('flies a Manual leg at its stored TAS throughout', () => {
    const s = departureSchedule(plan(at(30, 90), { tas: 380, alt: 20000 }), aircraft({ takeoff: { timeSec: 60, fuel: 200, distance: 2.5 } }));
    expect(s.pieces).toHaveLength(1);
    expect(scheduleTasAt(s, 0)).toBe(380);
    expect(scheduleTasAt(s, 1000)).toBe(380);
  });
});

describe('buildDeparturePath', () => {
  const manual = (wp1: { lat: number; lon: number }) => plan(wp1, { tas: 400 });

  it('matches the circular-arc construction when the speed is constant', () => {
    const p = manual(at(20, 0)); // north, a right turn off runway 27
    const path = build(p, defaultAircraft())!;
    const start = at(2, 270);
    const [, , sLat, sLon, dir] = calculateStraighteningPoint(
      270, start.lat, start.lon, p.points[1].lat, p.points[1].lon,
      calculateTurnRadius(400, 30), projection, 'projected',
    );
    const [ex, ey] = xy(sLat, sLon);
    const [ax, ay] = xy(path.rollOut.lat, path.rollOut.lon);
    expect(Math.hypot(ax - ex, ay - ey)).toBeLessThan(1);
    expect(path.turnDirection).toBe(dir);
  });

  it('turns right when WP1 is to the right and left when it is to the left', () => {
    expect(build(manual(at(20, 0)), defaultAircraft())!.turnDirection).toBe(-1);
    expect(build(manual(at(20, 180)), defaultAircraft())!.turnDirection).toBe(1);
  });

  it('flies straight when WP1 is on the runway axis', () => {
    const path = build(manual(at(10, 270)), defaultAircraft())!;
    expect(Math.abs(path.turnAngleRad)).toBeLessThan(1e-6);
    expect(Math.abs(path.rollOut.s - 2)).toBeLessThan(1e-6);
  });

  it('turns about 180° back when WP1 lies behind the airfield', () => {
    const p = manual(at(20, 90));
    const path = build(p, defaultAircraft())!;
    expect(Math.abs(path.turnAngleRad) * 180 / Math.PI).toBeGreaterThan(170);
    // A little past 180°: the turn circle (≈4 NM at 400 kt, 30° bank) sits beside the runway axis
    expect(Math.abs(path.turnAngleRad) * 180 / Math.PI).toBeLessThan(210);
    expect(path.rollOut.s + Math.hypot(...[0, 1].map(k => xy(path.rollOut.lat, path.rollOut.lon)[k] - xy(p.points[1].lat, p.points[1].lon)[k])) / NM).toBeGreaterThan(20);
  });

  it('widens the turn while accelerating', () => {
    // Take-off still running through the turn: S = 0.5 NM < D = 2.5 NM
    const p = plan(at(20, 90), { regimeId: 'r1', alt: 20000 });
    const ac = aircraft({ takeoff: { timeSec: 60, fuel: 200, distance: 2.5 } });
    const path = build(p, ac, 0.5)!;
    const i = path.samples.findIndex(s => s.t > path.turnStart.t);
    const rate = (k: number) => Math.abs(path.samples[k + 1].track - path.samples[k].track) / (path.samples[k + 1].s - path.samples[k].s);
    // Heading change per NM is 1/radius: smaller at the end means a wider turn
    expect(rate(path.samples.length - 3)).toBeLessThan(rate(i));
  });

  it('switches to the cruise-TAS radius at top of climb inside the turn', () => {
    // 1000 ft at 4000 fpm: top of climb after 15 s, while turning back towards WP1
    const p = plan(at(20, 90), { regimeId: 'r1', alt: 1000 });
    const path = build(p, aircraft(), 0.5)!;
    const tTop = 15;
    const before = path.samples.filter(s => s.t > path.turnStart.t && s.t <= tTop);
    const after = path.samples.filter(s => s.t > tTop && s.t < path.rollOut.t);
    const radiusNm = (a: { s: number; track: number }, b: { s: number; track: number }) =>
      (b.s - a.s) / (Math.abs(b.track - a.track) * Math.PI / 180);
    expect(radiusNm(before[0], before[before.length - 1]) * NM).toBeCloseTo(calculateTurnRadius(300, 30), -1);
    expect(radiusNm(after[0], after[after.length - 1]) * NM).toBeCloseTo(calculateTurnRadius(450, 30), -1);
  });

  it('is unreachable when WP1 is closer than the straight-out distance', () => {
    expect(build(manual(at(1.5, 90)), defaultAircraft())).toBeUndefined();
  });

  it('is unreachable when WP1 lies inside the turn', () => {
    // Abeam the straight-out segment, much closer than the ~4 NM turn radius at 400 kt
    expect(build(manual(at(2.2, 280)), defaultAircraft())).toBeUndefined();
  });
});

describe('departureTiming', () => {
  const p = plan(at(20, 90), { regimeId: 'r1', alt: 20000 });
  const ac = aircraft({ takeoff: { timeSec: 60, fuel: 200, distance: 1.5 } });
  const path = build(p, ac)!;
  const timing = departureTiming(path, 90);
  const calm = { windSpeed: 0, windDir: 0 };

  it('equals air distance and distance / TAS in still air', () => {
    expect(timing.groundDistance(0, 60, calm)).toBeCloseTo(1.5, 9);
    expect(timing.groundDistance(60, 200, calm)).toBeCloseTo(300 * 140 / 3600, 9);
    expect(timing.timeOver(5, 25, 450, calm)).toBeCloseTo(20 / 450 * 60, 9);
  });

  it('shortens the take-off ground distance with a headwind along the runway', () => {
    // Runway 27, wind from 270 at 20 kt: a headwind on take-off (the take-off ends before the turn)
    const headwind = timing.groundDistance(0, 60, { windSpeed: 20, windDir: 270 });
    expect(headwind).toBeCloseTo(1.5 - 20 * 60 / 3600, 6);
  });
});
