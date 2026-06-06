import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePersistedFlightPlan } from './usePersistedFlightPlan';
import type { FlightPlan } from '../types/flightPlan';

const STORAGE_KEY = 'dcsplan-flightplan';

const defaultPlan: FlightPlan = {
  theatre: 'syria',
  points: [],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Default Plan',
};

describe('usePersistedFlightPlan migration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('loads unversioned legacy data and adds theatre', () => {
    const legacyData = {
      points: [],
      declination: 12.5,
      bankAngle: 30,
      initTimeSec: 3600,
      initFob: 15000,
      name: 'Legacy Plan',
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyData));

    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));

    expect(result.current[0].theatre).toBe('syria');
    expect(result.current[0].name).toBe('Legacy Plan');
    expect(result.current[0].declination).toBe(12.5);
  });

  it('loads a versioned plan without migration when version matches', () => {
    const plan: FlightPlan = {
      theatre: 'caucasus',
      points: [],
      declination: 5,
      bankAngle: 45,
      initTimeSec: 43200,
      initFob: 12000,
      name: 'Current',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: '1.5', flightPlan: plan }));
    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));
    expect(result.current[0].theatre).toBe('caucasus');
    expect(result.current[0].name).toBe('Current');
  });

  it('falls back to default plan when stored data is invalid JSON', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json');

    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));

    expect(result.current[0]).toEqual(defaultPlan);
    expect(console.warn).toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('falls back to default plan when stored plan is structurally invalid', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: '1.5', flightPlan: { broken: true } }));
    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));
    expect(result.current[0]).toEqual(defaultPlan);
  });

  it('loads plan with waypoints correctly', () => {
    const plan: FlightPlan = {
      theatre: 'syria',
      points: [
        { lat: 0, lon: 0, tas: 400, alt: 10000, fuelFlow: 3600, windSpeed: 0, windDir: 0 },
        { lat: 1, lon: 1, tas: 400, alt: 10000, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'r1' },
      ],
      declination: 0,
      bankAngle: 45,
      initTimeSec: 43200,
      initFob: 12000,
      name: 'With Points',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: '1.5', flightPlan: plan }));
    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));
    expect(result.current[0].points).toHaveLength(2);
    expect(result.current[0].points[1].regimeId).toBe('r1');
  });
});
