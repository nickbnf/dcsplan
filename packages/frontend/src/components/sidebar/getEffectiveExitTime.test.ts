import { describe, it, expect } from 'vitest';
import { getEffectiveExitTime } from '../../utils/flightPlanUtils';

describe('getEffectiveExitTime', () => {
  const eta = 12 * 3600 + 30 * 60; // 12:30:00 = 45000 seconds

  it('defaults to ETA when exitTimeSec is undefined', () => {
    expect(getEffectiveExitTime(undefined, eta)).toBe(eta);
  });

  it('returns exitTimeSec when it is greater than ETA', () => {
    const exitTime = eta + 600; // 10 minutes after ETA
    expect(getEffectiveExitTime(exitTime, eta)).toBe(exitTime);
  });

  it('returns exitTimeSec when it equals ETA', () => {
    expect(getEffectiveExitTime(eta, eta)).toBe(eta);
  });

  it('clamps to ETA when exitTimeSec is less than ETA', () => {
    const exitTime = eta - 600; // 10 minutes before ETA
    expect(getEffectiveExitTime(exitTime, eta)).toBe(eta);
  });

  it('handles zero ETA', () => {
    expect(getEffectiveExitTime(undefined, 0)).toBe(0);
    expect(getEffectiveExitTime(100, 0)).toBe(100);
  });

  it('clamps stale exitTimeSec when ETA has shifted later', () => {
    // User originally set exit time to 12:35, but ETA shifted to 13:00
    const originalExit = 12 * 3600 + 35 * 60; // 12:35:00
    const newEta = 13 * 3600;                  // 13:00:00
    expect(getEffectiveExitTime(originalExit, newEta)).toBe(newEta);
  });
});
