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
    legIndex?: number;
    takeoff?: { timeSec: number; fuel: number; distance: number };
  };
  expected: Record<string, any>;
}

const fixtures: Fixture[] = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

describe('computeLegSegments contract tests (shared fixtures)', () => {
  for (const fixture of fixtures) {
    it(fixture.name, () => {
      const { prevAlt, legAlt, distance, course, windA, windB, tas, ff, regime, legIndex, takeoff } = fixture.input;
      const result = computeLegSegments(
        { prevAlt, legAlt, distance, course, windA, windB, tas, ff, legIndex, takeoff },
        regime ?? undefined
      );

      expect(result.kind).toBe(fixture.expected.kind);

      if (result.kind === 'level' && fixture.expected.kind === 'level') {
        expect(result.tas).toBeCloseTo(fixture.expected.tas, 3);
        expect(result.ff).toBeCloseTo(fixture.expected.ff, 3);
      }

      if (result.kind === 'segmented' && fixture.expected.kind === 'segmented') {
        if (fixture.expected.takeoff) {
          expect(result.takeoff).toBeDefined();
          expect(result.takeoff!.time).toBeCloseTo(fixture.expected.takeoff.time, 3);
          expect(result.takeoff!.distance).toBeCloseTo(fixture.expected.takeoff.distance, 3);
          expect(result.takeoff!.fuel).toBeCloseTo(fixture.expected.takeoff.fuel, 1);
        } else {
          expect(result.takeoff).toBeUndefined();
        }
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
