/**
 * Orphan regime bindings (add-library-profile-sync, task 8.3; spec:
 * performance-regime): cleared on load in the anonymous tier, kept in the
 * signed-in tier, where the profile may simply not have synced yet.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import type { Aircraft, FlightPlan } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';
import { get as getProjection } from 'ol/proj';
import { calculateAllLegData } from '../utils/legCalculations';

const legs = (p: FlightPlan, a: Aircraft) => calculateAllLegData(p, getProjection('EPSG:4326')!, 'projected', a);

let tier: 'anonymous' | 'signed-in' = 'anonymous';
let performance: Aircraft = defaultAircraft();
const onFlightPlanUpdate = vi.fn();
let plan: FlightPlan;

vi.mock('../contexts/FlightPlanContext', () => ({
  useFlightPlan: () => ({ flightPlan: plan, onFlightPlanUpdate }),
}));
vi.mock('../contexts/PerformanceContext', () => ({
  usePerformance: () => ({ performance, tier }),
}));

import { RegimeConsistencyGuard } from './Layout';

const wp = (id: string, lat: number, regimeId?: string) => ({
  id, lat, lon: 41, tas: 300, alt: 10000, fuelFlow: 5000, windSpeed: 0, windDir: 0,
  ...(regimeId ? { regimeId } : {}),
});

beforeEach(() => {
  onFlightPlanUpdate.mockReset();
  performance = defaultAircraft();
  plan = {
    theatre: 'caucasus', declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 20000, name: 'P',
    points: [wp('a', 42), wp('b', 42.5, 'r-not-here')],
  };
});

describe('RegimeConsistencyGuard', () => {
  it('anonymous: clears an orphan binding on load, keeping TAS and fuel flow', () => {
    tier = 'anonymous';
    render(<RegimeConsistencyGuard />);
    const updated: FlightPlan = onFlightPlanUpdate.mock.calls[0][0];
    expect(updated.points[1].regimeId).toBeUndefined();
    expect(updated.points[1].tas).toBe(300);
  });

  it('signed in: keeps the orphan binding and writes nothing', () => {
    tier = 'signed-in';
    render(<RegimeConsistencyGuard />);
    expect(onFlightPlanUpdate).not.toHaveBeenCalled();
  });

  it('signed in: the orphan leg computes as Manual, then from the regime once it arrives', () => {
    tier = 'signed-in';
    render(<RegimeConsistencyGuard />);
    const manual = legs(plan, performance);
    performance = {
      ...defaultAircraft(),
      regimes: [{ id: 'r-not-here', name: 'Fast', cruise: { tas: 600, ff: 12000 } }],
    };
    const bound = legs(plan, performance);
    expect(manual.at(-1)!.segmentsResult).toMatchObject({ tas: 300, ff: 5000 });   // stored Manual values
    expect(bound.at(-1)!.segmentsResult).toMatchObject({ tas: 600, ff: 12000 });   // the regime's
    expect(onFlightPlanUpdate).not.toHaveBeenCalled();
  });
});
