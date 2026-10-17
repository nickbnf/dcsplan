import { describe, it, expect } from 'vitest';
import { generatePlanId, isPlanId, PLAN_ID_ALPHABET } from './planId';

describe('planId', () => {
  it('generates 12 base58 characters', () => {
    for (let i = 0; i < 200; i++) {
      const id = generatePlanId();
      expect(id).toHaveLength(12);
      expect(isPlanId(id)).toBe(true);
    }
  });

  it('never uses look-alike characters and never yields "local"', () => {
    expect(PLAN_ID_ALPHABET).not.toMatch(/[0OIl]/);
    expect(PLAN_ID_ALPHABET).toHaveLength(58);
    expect(isPlanId('local')).toBe(false);
  });

  it('accepts only well-formed ids', () => {
    expect(isPlanId('k7Hq2mXv9B3n')).toBe(true);
    for (const bad of ['AAAAAAAAAAA', 'AAAAAAAAAAA0', 'AAAAAAAAAAAl', 'A'.repeat(13), '../x']) {
      expect(isPlanId(bad)).toBe(false);
    }
  });

  it('spreads characters roughly uniformly (no modulo bias)', () => {
    const counts = new Map<string, number>();
    const n = 5000;
    for (let i = 0; i < n; i++) {
      for (const c of generatePlanId()) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const expected = (n * 12) / 58;
    expect(counts.size).toBe(58);
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.75);
      expect(count).toBeLessThan(expected * 1.25);
    }
  });
});
