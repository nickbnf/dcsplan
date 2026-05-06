import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePersistedFlightPlan } from './usePersistedFlightPlan';
import type { FlightPlan } from '../types/flightPlan';

const STORAGE_KEY = 'dcsplan-flightplan';

const defaultPlan: FlightPlan = {
  theatre: 'syria',
  points: [],
  regimes: [],
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
    // Mock console to keep test output clean
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('should load legacy data (no version) and migrate by adding theatre', () => {
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

    // The hook returns FlightPlan, not VersionedFlightPlan
    // @ts-expect-error - version does not exist on FlightPlan
    expect(result.current[0].version).toBeUndefined();
    expect(result.current[0].theatre).toBe('syria');
    expect(result.current[0].name).toBe('Legacy Plan');
    expect(result.current[0].declination).toBe(12.5);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('Migrating flight plan from version legacy to 1.2')
    );
  });

  it('should load version 1.0 data and migrate by adding theatre', () => {
    const v10Data = {
      version: '1.0',
      flightPlan: {
        points: [],
        declination: 8.2,
        bankAngle: 25,
        initTimeSec: 7200,
        initFob: 10000,
        name: 'V1.0 Plan',
      },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(v10Data));

    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));

    expect(result.current[0].theatre).toBe('syria');
    expect(result.current[0].name).toBe('V1.0 Plan');
    expect(result.current[0].declination).toBe(8.2);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('Migrating flight plan from version 1.0 to 1.2')
    );
  });

  it('should load version 1.1 data and migrate to 1.2 (adding regimes)', () => {
    const v11Data = {
      version: '1.1',
      flightPlan: {
        theatre: 'custom_theatre',
        points: [],
        declination: 5.5,
        bankAngle: 35,
        initTimeSec: 1000,
        initFob: 8000,
        name: 'V1.1 Plan',
      },
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(v11Data));

    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));

    expect(result.current[0].theatre).toBe('custom_theatre');
    expect(result.current[0].name).toBe('V1.1 Plan');
    expect(result.current[0].regimes).toEqual([]);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('Migrating flight plan from version 1.1 to 1.2')
    );
  });

  it('v1.1 plan: missing regimes becomes []', () => {
    const v11Data = {
      version: '1.1',
      flightPlan: {
        theatre: 'syria',
        points: [{ lat: 0, lon: 0, tas: 400, alt: 10000, fuelFlow: 3600, windSpeed: 0, windDir: 0 }],
        declination: 0,
        bankAngle: 45,
        initTimeSec: 43200,
        initFob: 12000,
        name: 'V1.1',
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v11Data));
    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));
    expect(result.current[0].regimes).toEqual([]);
  });

  it('v1.1 plan: missing regimeId on waypoints stays absent', () => {
    const v11Data = {
      version: '1.1',
      flightPlan: {
        theatre: 'syria',
        points: [{ lat: 0, lon: 0, tas: 400, alt: 10000, fuelFlow: 3600, windSpeed: 0, windDir: 0 }],
        declination: 0,
        bankAngle: 45,
        initTimeSec: 43200,
        initFob: 12000,
        name: 'V1.1',
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v11Data));
    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));
    expect(result.current[0].points[0].regimeId).toBeUndefined();
  });

  it('v1.1 plan: orphan regimeId is cleared on load', () => {
    const v11Data = {
      version: '1.1',
      flightPlan: {
        theatre: 'syria',
        points: [{ lat: 0, lon: 0, tas: 400, alt: 10000, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'orphan123' }],
        declination: 0,
        bankAngle: 45,
        initTimeSec: 43200,
        initFob: 12000,
        name: 'V1.1',
        regimes: [],
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(v11Data));
    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));
    expect(result.current[0].points[0].regimeId).toBeUndefined();
  });

  it('should clear invalid data and use default plan', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json');

    const { result } = renderHook(() => usePersistedFlightPlan(() => defaultPlan));

    expect(result.current[0]).toEqual(defaultPlan);
    expect(console.warn).toHaveBeenCalled();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

