/**
 * Golden tests: leg values computed with each theatre's navigation settings
 * must not change when the theatre/map configuration is reorganized
 * (add-theatre-maps). Regenerate with UPDATE_GOLDEN=1 only when a change in
 * computed values is intended.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { calculateAllLegData, calculateAllLegDrawData } from './legCalculations';
import { createNavigation } from '../hooks/useTheatreNavigation';
import type { FlightPlan } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

const GOLDEN_DIR = resolve(__dirname, '../../../shared/theatre-golden');
const THEATRES_DIR = resolve(__dirname, '../../../backend/theatres');
const EXPECTED_PATH = resolve(GOLDEN_DIR, 'frontend-expected.json');

const plans: FlightPlan[] = JSON.parse(readFileSync(resolve(GOLDEN_DIR, 'plans.json'), 'utf-8'));

function loadNavigation(theatre: string) {
  const config = JSON.parse(readFileSync(resolve(THEATRES_DIR, theatre, 'theatre.json'), 'utf-8'));
  const { projection, navigationMode } = createNavigation(config.navigation);
  return { projection, mode: navigationMode };
}

function compute(plan: FlightPlan) {
  const { projection, mode } = loadNavigation(plan.theatre);
  const legs = calculateAllLegData(plan, projection, mode, defaultAircraft());
  const draw = calculateAllLegDrawData(plan, projection, mode);
  return {
    legs: legs.map(l => ({ course: l.course, heading: l.heading, distance: l.distance, ete: l.ete, legFuel: l.legFuel })),
    draw: draw.map(d => ({
      turnCenterLat: d.turnCenterLat, turnCenterLon: d.turnCenterLon,
      straighteningLat: d.straighteningLat, straighteningLon: d.straighteningLon,
      heading: d.heading,
    })),
  };
}

if (process.env.UPDATE_GOLDEN) {
  writeFileSync(EXPECTED_PATH, JSON.stringify(Object.fromEntries(plans.map(p => [p.theatre, compute(p)])), null, 2));
}

describe('theatre golden leg values', () => {
  const expected = JSON.parse(readFileSync(EXPECTED_PATH, 'utf-8'));
  for (const plan of plans) {
    it(`${plan.theatre}: leg and draw values unchanged`, () => {
      const actual = compute(plan);
      const exp = expected[plan.theatre];
      for (const section of ['legs', 'draw'] as const) {
        expect(actual[section].length).toBe(exp[section].length);
        actual[section].forEach((leg: Record<string, number>, i: number) => {
          for (const [key, value] of Object.entries(exp[section][i] as Record<string, number>)) {
            expect(leg[key], `${section}[${i}].${key}`).toBeCloseTo(value, 9);
          }
        });
      }
    });
  }
});
