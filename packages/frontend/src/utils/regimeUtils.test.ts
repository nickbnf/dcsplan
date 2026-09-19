import { describe, it, expect } from 'vitest';
import {
  applyRegimeToWaypoint,
  clearRegimeBinding,
  clearRegimeFromAllWaypoints,
} from './regimeUtils';
import type { FlightPlan, FlightPlanTurnPoint, Regime } from '../types/flightPlan';

function makeWaypoint(overrides: Partial<FlightPlanTurnPoint> = {}): FlightPlanTurnPoint {
  return { lat: 0, lon: 0, tas: 400, alt: 10000, fuelFlow: 3600, windSpeed: 0, windDir: 0, ...overrides };
}

function makePlan(points: FlightPlanTurnPoint[]): FlightPlan {
  return {
    theatre: 'test', points, declination: 0,
    bankAngle: 45, initTimeSec: 43200, initFob: 12000, name: 'Test',
  };
}

function makeRegime(overrides: Partial<Regime> = {}): Regime {
  return { id: 'r1', name: 'Test', cruise: { tas: 350, ff: 4000 }, ...overrides };
}

describe('applyRegimeToWaypoint', () => {
  it('sets regimeId without changing tas or fuelFlow', () => {
    const wpt = makeWaypoint({ tas: 400, fuelFlow: 3600 });
    const regime = makeRegime({ cruise: { tas: 350, ff: 4000 } });
    const result = applyRegimeToWaypoint(wpt, regime);
    expect(result.regimeId).toBe('r1');
    expect(result.tas).toBe(400);
    expect(result.fuelFlow).toBe(3600);
  });

  it('does not mutate the original waypoint', () => {
    const wpt = makeWaypoint();
    applyRegimeToWaypoint(wpt, makeRegime());
    expect(wpt.regimeId).toBeUndefined();
  });
});

describe('clearRegimeBinding', () => {
  it('removes regimeId while retaining tas and fuelFlow', () => {
    const wpt = makeWaypoint({ regimeId: 'r1', tas: 350, fuelFlow: 4000 });
    const result = clearRegimeBinding(wpt);
    expect(result.regimeId).toBeUndefined();
    expect(result.tas).toBe(350);
    expect(result.fuelFlow).toBe(4000);
  });

  it('does not mutate the original waypoint', () => {
    const wpt = makeWaypoint({ regimeId: 'r1' });
    clearRegimeBinding(wpt);
    expect(wpt.regimeId).toBe('r1');
  });
});

describe('clearRegimeFromAllWaypoints', () => {
  it('clears regimeId from all waypoints bound to the given id while retaining values', () => {
    const plan = makePlan([
      makeWaypoint({ regimeId: 'r1', tas: 350, fuelFlow: 4000 }),
      makeWaypoint({ regimeId: 'r2', tas: 300, fuelFlow: 3000 }),
    ]);
    const result = clearRegimeFromAllWaypoints(plan, 'r1');
    expect(result.points[0].regimeId).toBeUndefined();
    expect(result.points[0].tas).toBe(350);
    expect(result.points[0].fuelFlow).toBe(4000);
    expect(result.points[1].regimeId).toBe('r2'); // unaffected
  });

  it('does not mutate the original plan', () => {
    const plan = makePlan([makeWaypoint({ regimeId: 'r1' })]);
    clearRegimeFromAllWaypoints(plan, 'r1');
    expect(plan.points[0].regimeId).toBe('r1');
  });
});
