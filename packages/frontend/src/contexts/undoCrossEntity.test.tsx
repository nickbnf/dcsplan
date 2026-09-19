import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FlightPlanProvider, useFlightPlan } from './FlightPlanContext';
import { PerformanceProvider, usePerformance } from './PerformanceContext';
import { clearRegimeFromAllWaypoints } from '../utils/regimeUtils';
import type { Aircraft, FlightPlan, FlightPlanTurnPoint, Regime } from '../types/flightPlan';

/**
 * Cross-entity undo (AD-12, "Open — cross-entity actions").
 *
 * After de-mirroring (D11), editing a regime no longer writes to the flight
 * plan, so the regime-editing undo defect is dissolved — there is nothing on the
 * plan's undo stack for regime value changes.
 *
 * The deletion case remains: deleting a regime clears regimeId from waypoints
 * (plan-side) and removes the regime from the profile (perf-side). Undo restores
 * regimeId but not the regime, leaving a dangling reference.
 */

const REGIME_ID = 'regime-cruise';

function makeRegime(ff: number): Regime {
  return { id: REGIME_ID, name: 'Cruise', cruise: { tas: 400, ff } };
}

function makeAircraft(ff: number): Aircraft {
  return {
    model: 'F-15E',
    takeoffConfiguration: '',
    taxiFuel: 0,
    takeoff: { timeSec: 0, fuel: 0, distance: 0 },
    regimes: [makeRegime(ff)],
  };
}

function makePoint(overrides: Partial<FlightPlanTurnPoint> = {}): FlightPlanTurnPoint {
  return {
    lat: 0, lon: 0, alt: 20000, tas: 400, fuelFlow: 3600,
    windSpeed: 0, windDir: 0,
    ...overrides,
  } as FlightPlanTurnPoint;
}

function makePlan(): FlightPlan {
  return {
    theatre: 'syria',
    points: [
      makePoint(),
      makePoint({ lat: 1, lon: 1, regimeId: REGIME_ID }),
    ],
    declination: 0,
    bankAngle: 45,
    initTimeSec: 43200,
    initFob: 12000,
    name: 'Cross-entity test',
  };
}

function expectBoundRegimesExist(plan: FlightPlan, aircraft: Aircraft) {
  for (const point of plan.points) {
    if (!point.regimeId) continue;
    const regime = aircraft.regimes.find(r => r.id === point.regimeId);
    expect(regime, `waypoint bound to missing regime "${point.regimeId}"`).toBeDefined();
  }
}

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PerformanceProvider>
    <FlightPlanProvider>{children}</FlightPlanProvider>
  </PerformanceProvider>
);

function setup() {
  const view = renderHook(
    () => ({ plan: useFlightPlan(), perf: usePerformance() }),
    { wrapper }
  );

  act(() => {
    view.result.current.perf.setPerformance(makeAircraft(3600));
    view.result.current.plan.replaceFlightPlan(makePlan());
  });

  return view;
}

describe('undo across the plan/profile boundary', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('arranges a consistent bound leg', () => {
    const { result } = setup();
    expectBoundRegimesExist(result.current.plan.flightPlan, result.current.perf.performance);
    expect(result.current.plan.canUndo).toBe(false);
  });

  it('editing regime cruise values does not modify the flight plan', () => {
    const { result } = setup();

    act(() => {
      const updated = makeRegime(4000);
      result.current.perf.setPerformance({ ...result.current.perf.performance, regimes: [updated] });
    });

    expect(result.current.plan.canUndo).toBe(false);
    expect(result.current.plan.flightPlan.points[1]!.regimeId).toBe(REGIME_ID);
    expect(result.current.plan.flightPlan.points[1]!.fuelFlow).toBe(3600);
    expect(result.current.perf.performance.regimes[0]!.cruise.ff).toBe(4000);
  });

  it.fails('undoing a regime deletion rebinds legs to a regime that no longer exists', () => {
    const { result } = setup();

    act(() => {
      result.current.plan.onFlightPlanUpdate(
        clearRegimeFromAllWaypoints(result.current.plan.flightPlan, REGIME_ID)
      );
      result.current.perf.setPerformance({ ...result.current.perf.performance, regimes: [] });
    });

    expect(result.current.plan.flightPlan.points[1]!.regimeId).toBeUndefined();

    act(() => { result.current.plan.undo(); });

    expect(result.current.plan.flightPlan.points[1]!.regimeId).toBe(REGIME_ID);
    expectBoundRegimesExist(result.current.plan.flightPlan, result.current.perf.performance);
  });
});
