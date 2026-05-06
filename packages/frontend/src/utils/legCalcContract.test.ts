/**
 * Contract tests: computeLegSegments output must match shared JSON fixtures
 * to ensure TS and Python implementations agree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { computeLegSegments } from './legCalculations';
import type { Regime } from '../types/flightPlan';

const FIXTURE_PATH = resolve(__dirname, '../../../../packages/shared/leg-calc-fixtures/fixtures.json');

interface Fixture {
  name: string;
  description: string;
  input: {
    prevAlt: number;
    legAlt: number;
    distance: number;
    course: number;
    windA: { windSpeed: number; windDir: number };
    windB: { windSpeed: number; windDir: number };
    tas: number;
    ff: number;
    regime: Regime | null;
  };
  expected: Record<string, any>;
}

const fixtures: Fixture[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

describe('computeLegSegments contract tests (shared fixtures)', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const { prevAlt, legAlt, distance, course, windA, windB, tas, ff, regime } = fixture.input;
      const result = computeLegSegments(
        { prevAlt, legAlt, distance, course, windA, windB, tas, ff },
        regime ?? undefined
      );

      expect(result.kind).toBe(fixture.expected.kind);

      if (result.kind === 'level' && fixture.expected.kind === 'level') {
        expect(result.tas).toBeCloseTo(fixture.expected.tas, 3);
        expect(result.ff).toBeCloseTo(fixture.expected.ff, 3);
      }

      if (result.kind === 'segmented' && fixture.expected.kind === 'segmented') {
        expect(result.transition.phase).toBe(fixture.expected.transition.phase);
        expect(result.transition.time).toBeCloseTo(fixture.expected.transition.time, 3);
        expect(result.transition.distance).toBeCloseTo(fixture.expected.transition.distance, 3);
        expect(result.transition.fuel).toBeCloseTo(fixture.expected.transition.fuel, 1);
        expect(result.cruise.time).toBeCloseTo(fixture.expected.cruise.time, 3);
        expect(result.cruise.distance).toBeCloseTo(fixture.expected.cruise.distance, 3);
        expect(result.cruise.fuel).toBeCloseTo(fixture.expected.cruise.fuel, 1);
      }

      if (result.kind === 'warning' && fixture.expected.kind === 'warning') {
        expect(result.reason).toBe(fixture.expected.reason);
        expect(result.transitionDistance).toBeCloseTo(fixture.expected.transitionDistance, 2);
        expect(result.reachableAltDelta).toBeCloseTo(fixture.expected.reachableAltDelta, 0);
      }
    });
  }
});
