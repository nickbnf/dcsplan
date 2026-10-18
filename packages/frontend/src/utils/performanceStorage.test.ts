import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPerformance,
  savePerformance,
  PERFORMANCE_STORAGE_KEY,
} from './performanceStorage';
import { defaultAircraft } from '../types/flightPlan';

beforeEach(() => {
  localStorage.clear();
});

describe('loadPerformance', () => {
  it('returns the default aircraft when storage is empty', () => {
    expect(loadPerformance()).toEqual(defaultAircraft());
  });

  it('loads the { version, aircraft } envelope', () => {
    const aircraft = { ...defaultAircraft(), model: 'F-16C' };
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify({ version: '1.0', aircraft }));
    expect(loadPerformance().model).toBe('F-16C');
  });

  it('ignores a name left by earlier versions', () => {
    const aircraft = { ...defaultAircraft(), model: 'F-15E' };
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify({ version: '1.0', name: 'My F-15E', aircraft }));
    const loaded = loadPerformance();
    expect(loaded.model).toBe('F-15E');
    expect('name' in loaded).toBe(false);
  });

  it('loads the old format (plain Aircraft block)', () => {
    const aircraft = { ...defaultAircraft(), model: 'A-10C' };
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(aircraft));
    expect(loadPerformance().model).toBe('A-10C');
  });

  it('returns the defaults for corrupted JSON', () => {
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, '{not valid json');
    expect(loadPerformance()).toEqual(defaultAircraft());
  });
});

describe('savePerformance / round-trip', () => {
  it('round-trips the aircraft through save/load', () => {
    const aircraft = { ...defaultAircraft(), model: 'F-18C', taxiFuel: 200 };
    savePerformance(aircraft);
    expect(loadPerformance()).toEqual(aircraft);
  });

  it('saves a { version, aircraft } envelope with no name', () => {
    savePerformance(defaultAircraft());
    const raw = JSON.parse(localStorage.getItem(PERFORMANCE_STORAGE_KEY)!);
    expect(raw.version).toBe('1.0');
    expect(raw.aircraft).toBeDefined();
    expect('name' in raw).toBe(false);
  });
});
