import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { FlightPlanProvider, useFlightPlan } from './FlightPlanContext';
import { PerformanceProvider, usePerformance } from './PerformanceContext';
import { propagateRegimeCruiseChange, clearRegimeFromAllWaypoints } from '../utils/regimeUtils';
import type { Aircraft, FlightPlan, FlightPlanTurnPoint, Regime } from '../types/flightPlan';

/**
 * KNOWN DEFECT — cross-entity undo (AD-12, "Open — cross-entity actions").
 *
 * Editing a regime on the Performance page writes to two entities at once: the
 * profile (setPerformance) and the flight plan (propagateRegimeCruiseChange
 * mirrors the regime's cruise TAS/FF onto every bound waypoint). Only the plan
 * half is captured by the undo stack, because the profile stack is deferred.
 *
 * Undo therefore rewinds the mirrored values while the regime keeps its new
 * ones, leaving a leg that is still bound to a regime whose numbers it no longer
 * matches — the exact state the "direct edits revert the leg to Manual" rule
 * exists to prevent. It is not cosmetic: computeLegSegments uses the waypoint's
 * mirrored tas/ff for a level leg, so a stale value reaches leg fuel and the
 * kneeboard.
 *
 * These tests use `it.fails`, so they document the broken behaviour without
 * turning the suite red. When the defect is fixed they will start failing —
 * that is the signal to drop `.fails` and keep them as regression tests.
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

/**
 * The invariant: a leg bound to a regime must carry that regime's cruise
 * numbers. A leg whose values have diverged should have been dropped to Manual.
 */
function expectBoundLegsToMatchTheirRegime(plan: FlightPlan, aircraft: Aircraft) {
  for (const point of plan.points) {
    if (!point.regimeId) continue;
    const regime = aircraft.regimes.find(r => r.id === point.regimeId);
    expect(regime, `waypoint bound to missing regime "${point.regimeId}"`).toBeDefined();
    expect(point.fuelFlow).toBe(regime!.cruise.ff);
    expect(point.tas).toBe(regime!.cruise.tas);
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

  // Arrange through the replace path so the setup itself leaves no undo entries.
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
    expectBoundLegsToMatchTheirRegime(result.current.plan.flightPlan, result.current.perf.performance);
    expect(result.current.plan.canUndo).toBe(false);
  });

  it('propagating a regime cruise change keeps the leg consistent', () => {
    const { result } = setup();

    // What PerformancePage.handleRegimeChange does, in order.
    act(() => {
      const updated = makeRegime(4000);
      result.current.perf.setPerformance({ ...result.current.perf.performance, regimes: [updated] });
      result.current.plan.onFlightPlanUpdate(
        propagateRegimeCruiseChange(result.current.plan.flightPlan, updated)
      );
    });

    expect(result.current.plan.flightPlan.points[1]!.fuelFlow).toBe(4000);
    expect(result.current.plan.flightPlan.points[1]!.regimeId).toBe(REGIME_ID);
    expectBoundLegsToMatchTheirRegime(result.current.plan.flightPlan, result.current.perf.performance);
  });

  it.fails('undoing a regime cruise change leaves the leg bound to a regime it no longer matches', () => {
    const { result } = setup();

    act(() => {
      const updated = makeRegime(4000);
      result.current.perf.setPerformance({ ...result.current.perf.performance, regimes: [updated] });
      result.current.plan.onFlightPlanUpdate(
        propagateRegimeCruiseChange(result.current.plan.flightPlan, updated)
      );
    });

    act(() => { result.current.plan.undo(); });

    // The plan half rewinds to 3600; the profile still says 4000. The leg is
    // still bound, so this violates the invariant.
    expect(result.current.plan.flightPlan.points[1]!.fuelFlow).toBe(3600);
    expect(result.current.perf.performance.regimes[0]!.cruise.ff).toBe(4000);
    expectBoundLegsToMatchTheirRegime(result.current.plan.flightPlan, result.current.perf.performance);
  });

  it.fails('undoing a regime deletion rebinds legs to a regime that no longer exists', () => {
    const { result } = setup();

    // What PerformancePage.handleDeleteConfirm does, in order.
    act(() => {
      result.current.plan.onFlightPlanUpdate(
        clearRegimeFromAllWaypoints(result.current.plan.flightPlan, REGIME_ID)
      );
      result.current.perf.setPerformance({ ...result.current.perf.performance, regimes: [] });
    });

    expect(result.current.plan.flightPlan.points[1]!.regimeId).toBeUndefined();

    act(() => { result.current.plan.undo(); });

    // regimeId comes back, but the regime is gone: regimes.find() yields
    // undefined and the leg silently computes from its stale mirrored values.
    expect(result.current.plan.flightPlan.points[1]!.regimeId).toBe(REGIME_ID);
    expectBoundLegsToMatchTheirRegime(result.current.plan.flightPlan, result.current.perf.performance);
  });
});
