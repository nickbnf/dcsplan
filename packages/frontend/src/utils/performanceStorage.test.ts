import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadPerformance,
  savePerformance,
  PERFORMANCE_STORAGE_KEY,
  DEFAULT_PROFILE_NAME,
} from './performanceStorage';
import { defaultAircraft } from '../types/flightPlan';

beforeEach(() => {
  localStorage.clear();
});

describe('loadPerformance', () => {
  it('returns default profile when storage is empty', () => {
    const profile = loadPerformance();
    expect(profile.name).toBe(DEFAULT_PROFILE_NAME);
    expect(profile.aircraft).toEqual(defaultAircraft());
  });

  it('loads new-format envelope with name', () => {
    const aircraft = { ...defaultAircraft(), model: 'F-15E' };
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify({
      version: '1.0', name: 'My F-15E', aircraft,
    }));
    const profile = loadPerformance();
    expect(profile.name).toBe('My F-15E');
    expect(profile.aircraft.model).toBe('F-15E');
  });

  it('derives name from model when envelope has no name', () => {
    const aircraft = { ...defaultAircraft(), model: 'F-16C' };
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify({
      version: '1.0', aircraft,
    }));
    const profile = loadPerformance();
    expect(profile.name).toBe('F-16C');
  });

  it('loads old-format (plain Aircraft block) and derives name', () => {
    const aircraft = { ...defaultAircraft(), model: 'A-10C' };
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(aircraft));
    const profile = loadPerformance();
    expect(profile.name).toBe('A-10C');
    expect(profile.aircraft.model).toBe('A-10C');
  });

  it('falls back to default name when old-format has empty model', () => {
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, JSON.stringify(defaultAircraft()));
    const profile = loadPerformance();
    expect(profile.name).toBe(DEFAULT_PROFILE_NAME);
  });

  it('returns default profile for corrupted JSON', () => {
    localStorage.setItem(PERFORMANCE_STORAGE_KEY, '{not valid json');
    const profile = loadPerformance();
    expect(profile.name).toBe(DEFAULT_PROFILE_NAME);
    expect(profile.aircraft).toEqual(defaultAircraft());
  });
});

describe('savePerformance / round-trip', () => {
  it('round-trips name and aircraft through save/load', () => {
    const aircraft = { ...defaultAircraft(), model: 'F-18C', taxiFuel: 200 };
    savePerformance({ name: 'Hornet Profile', aircraft });
    const loaded = loadPerformance();
    expect(loaded.name).toBe('Hornet Profile');
    expect(loaded.aircraft.model).toBe('F-18C');
    expect(loaded.aircraft.taxiFuel).toBe(200);
  });

  it('saves envelope with version field', () => {
    savePerformance({ name: 'Test', aircraft: defaultAircraft() });
    const raw = JSON.parse(localStorage.getItem(PERFORMANCE_STORAGE_KEY)!);
    expect(raw.version).toBe('1.0');
    expect(raw.name).toBe('Test');
    expect(raw.aircraft).toBeDefined();
  });
});
