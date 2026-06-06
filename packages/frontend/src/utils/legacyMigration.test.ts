import { describe, it, expect, beforeEach } from 'vitest';
import { bootstrapPerformanceFromLegacyPlan } from './legacyMigration';
import { PERFORMANCE_STORAGE_KEY } from './performanceStorage';

const FLIGHT_PLAN_KEY = 'dcsplan-flightplan';

const defaultAircraftBlock = {
  model: 'F-15E',
  takeoffConfiguration: 'MIL',
  taxiFuel: 400,
  takeoff: { timeSec: 0, fuel: 0, distance: 0 },
  regimes: [{ id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } }],
};

describe('bootstrapPerformanceFromLegacyPlan', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('no-op when localStorage has no flight plan', () => {
    bootstrapPerformanceFromLegacyPlan();
    expect(localStorage.getItem(PERFORMANCE_STORAGE_KEY)).toBeNull();
  });

  it('no-op when legacy plan has no aircraft block', () => {
    const plan = { version: '1.4', flightPlan: { theatre: 'syria', points: [] } };
    localStorage.setItem(FLIGHT_PLAN_KEY, JSON.stringify(plan));
    bootstrapPerformanceFromLegacyPlan();
    expect(localStorage.getItem(PERFORMANCE_STORAGE_KEY)).toBeNull();
  });

  it('migrates aircraft from legacy plan to dcsplan.performance when no profile exists', () => {
    const plan = {
      version: '1.4',
      flightPlan: { theatre: 'syria', points: [], aircraft: defaultAircraftBlock },
    };
    localStorage.setItem(FLIGHT_PLAN_KEY, JSON.stringify(plan));

    bootstrapPerformanceFromLegacyPlan();

    const stored = JSON.parse(localStorage.getItem(PERFORMANCE_STORAGE_KEY)!);
    expect(stored.model).toBe('F-15E');
    expect(stored.regimes).toHaveLength(1);
    expect(stored.regimes[0].id).toBe('r1');
  });

  it('does not clobber existing dcsplan.performance on migration', () => {
    const existingProfile = {
      model: 'F-16C',
      takeoffConfiguration: 'AB',
      taxiFuel: 300,
      takeoff: { timeSec: 0, fuel: 0, distance: 0 },
      regimes: [],
    };
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(existingProfile));

    const plan = {
      version: '1.4',
      flightPlan: { theatre: 'syria', points: [], aircraft: defaultAircraftBlock },
    };
    localStorage.setItem(FLIGHT_PLAN_KEY, JSON.stringify(plan));

    bootstrapPerformanceFromLegacyPlan();

    // Existing profile should be preserved
    const stored = JSON.parse(localStorage.getItem(PERFORMANCE_STORAGE_KEY)!);
    expect(stored.model).toBe('F-16C');
  });

  it('strips aircraft from flightPlan and rewrites as v1.5', () => {
    const plan = {
      version: '1.4',
      flightPlan: { theatre: 'syria', points: [], aircraft: defaultAircraftBlock },
    };
    localStorage.setItem(FLIGHT_PLAN_KEY, JSON.stringify(plan));

    bootstrapPerformanceFromLegacyPlan();

    const updated = JSON.parse(localStorage.getItem(FLIGHT_PLAN_KEY)!);
    expect(updated.version).toBe('1.5');
    expect(updated.flightPlan.aircraft).toBeUndefined();
    expect(updated.flightPlan.theatre).toBe('syria');
  });

  it('also strips top-level legacy regimes field from flightPlan', () => {
    const plan = {
      version: '1.2',
      flightPlan: {
        theatre: 'syria',
        points: [],
        aircraft: defaultAircraftBlock,
        regimes: [{ id: 'r2', name: 'Old', cruise: { tas: 300, ff: 3000 } }],
      },
    };
    localStorage.setItem(FLIGHT_PLAN_KEY, JSON.stringify(plan));

    bootstrapPerformanceFromLegacyPlan();

    const updated = JSON.parse(localStorage.getItem(FLIGHT_PLAN_KEY)!);
    expect(updated.flightPlan.regimes).toBeUndefined();
  });

  it('is idempotent when called twice', () => {
    const plan = {
      version: '1.4',
      flightPlan: { theatre: 'syria', points: [], aircraft: defaultAircraftBlock },
    };
    localStorage.setItem(FLIGHT_PLAN_KEY, JSON.stringify(plan));

    bootstrapPerformanceFromLegacyPlan();
    bootstrapPerformanceFromLegacyPlan(); // second call: no aircraft in plan, no-op

    const stored = JSON.parse(localStorage.getItem(PERFORMANCE_STORAGE_KEY)!);
    expect(stored.model).toBe('F-15E');
  });
});
