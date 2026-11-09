import { describe, it, expect } from 'vitest';
import { get as getProjection } from 'ol/proj';
import { computeMeasurement, formatMeasurement, measureReducer, initialMeasureState, isMeasuring } from './measure';
import type { MeasureState, MeasureEvent } from './measure';
import { computeLegGeometries } from './legCalculations';
import type { FlightPlan } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

// Use EPSG:4326 as a simple projection for testing
const projection = getProjection('EPSG:4326')!;

function makePlan(declination: number, a: { lat: number; lon: number }, b: { lat: number; lon: number }): FlightPlan {
  const point = (id: string, p: { lat: number; lon: number }) => ({
    id, ...p, tas: 400, alt: 20000, fuelFlow: 3600, windSpeed: 0, windDir: 0,
  });
  return {
    theatre: 'test',
    points: [point('a', a), point('b', b)],
    declination,
    bankAngle: 45,
    initTimeSec: 12 * 3600,
    initFob: 10000,
    name: 'Test',
  } as FlightPlan;
}

describe('computeMeasurement — matches the leg computation (map-measure)', () => {
  const a = { lat: 34.2, lon: 35.6 };
  const b = { lat: 35.1, lon: 36.9 };

  for (const navigationMode of ['geographic', 'projected']) {
    it(`equals the first leg's magnetic course and distance (${navigationMode})`, () => {
      const declination = 4.5;
      const navigation = { navigationMode, projection };
      const leg = computeLegGeometries(makePlan(declination, a, b), projection, navigationMode, defaultAircraft())[0];

      const m = computeMeasurement(a, b, navigation, declination);

      expect(m.bearing).toBeCloseTo(leg.course, 9);
      expect(m.distanceNm).toBeCloseTo(leg.distanceNm, 9);
    });
  }

  it('subtracts an easterly declination: 090 true, 6°E → 084M', () => {
    const m = computeMeasurement({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, { navigationMode: 'projected', projection }, 6);
    expect(m.bearing).toBeCloseTo(84, 9);
    expect(m.reciprocal).toBeCloseTo(264, 9);
  });

  it('only the bearings move when the declination changes', () => {
    const nav = { navigationMode: 'geographic', projection };
    const m0 = computeMeasurement(a, b, nav, 0);
    const m6 = computeMeasurement(a, b, nav, -6);
    expect(m6.bearing).toBeCloseTo((m0.bearing + 6) % 360, 9);
    expect(m6.reciprocal).toBeCloseTo((m0.reciprocal + 6) % 360, 9);
    expect(m6.distanceNm).toBe(m0.distanceNm);
  });

  it('reciprocal is the true B → A bearing, not bearing + 180, in geographic mode', () => {
    // Long east-west line at high latitude: great-circle bearings differ markedly from reciprocal + 180
    const m = computeMeasurement({ lat: 60, lon: 0 }, { lat: 60, lon: 20 }, { navigationMode: 'geographic', projection }, 0);
    expect(m.bearing).toBeLessThan(90);
    expect(m.reciprocal).toBeGreaterThan(270);
    expect(Math.abs(m.reciprocal - (m.bearing + 180))).toBeGreaterThan(5);
  });

  it('reciprocal is exactly bearing + 180 in projected mode', () => {
    const m = computeMeasurement({ lat: 0, lon: 0 }, { lat: 1, lon: 2 }, { navigationMode: 'projected', projection }, 3);
    expect(m.reciprocal).toBeCloseTo((m.bearing + 180) % 360, 9);
  });
});

describe('formatMeasurement — readout format (map-measure)', () => {
  it('shows bearing, distance and the reciprocal as secondary text', () => {
    expect(formatMeasurement({ bearing: 87.4, distanceNm: 23.44, reciprocal: 267.4 }))
      .toEqual({ primary: '087°M  23.4 NM', secondary: '(267°M)' });
  });

  it('rounds a bearing near north to 000', () => {
    expect(formatMeasurement({ bearing: 359.6, distanceNm: 1, reciprocal: 179.6 }))
      .toEqual({ primary: '000°M  1.0 NM', secondary: '(180°M)' });
  });

  it('zero-pads small bearings', () => {
    expect(formatMeasurement({ bearing: 4.2, distanceNm: 0.04, reciprocal: 184.2 }).primary).toBe('004°M  0.0 NM');
  });
});

describe('measureReducer — phases (map-measure)', () => {
  const A: [number, number] = [1, 2];
  const B: [number, number] = [3, 4];
  const run = (...events: MeasureEvent[]): MeasureState => events.reduce(measureReducer, initialMeasureState);
  const armed = () => run({ type: 'toggle' });
  const rubberband = () => run({ type: 'toggle' }, { type: 'click', coord: A });
  const pinned = () => run({ type: 'toggle' }, { type: 'click', coord: A }, { type: 'click', coord: B });

  it('toggle arms the tool from idle', () => {
    expect(armed()).toEqual({ phase: 'armed', a: null, b: null });
  });

  it('first click sets A, B follows the cursor, second click pins B', () => {
    expect(rubberband()).toEqual({ phase: 'rubberband', a: A, b: A });
    expect(measureReducer(rubberband(), { type: 'move', coord: [9, 9] })).toEqual({ phase: 'rubberband', a: A, b: [9, 9] });
    expect(pinned()).toEqual({ phase: 'pinned', a: A, b: B });
  });

  it('only armed and rubberband consume map clicks', () => {
    expect(isMeasuring('armed')).toBe(true);
    expect(isMeasuring('rubberband')).toBe(true);
    expect(isMeasuring('pinned')).toBe(false);
    expect(isMeasuring('idle')).toBe(false);
  });

  it('a pinned measurement ignores clicks and moves (single measurement)', () => {
    const s = pinned();
    expect(measureReducer(s, { type: 'click', coord: [7, 7] })).toBe(s);
    expect(measureReducer(s, { type: 'move', coord: [7, 7] })).toBe(s);
  });

  it('Esc after placing A removes A and keeps the tool armed', () => {
    expect(measureReducer(rubberband(), { type: 'escape' })).toEqual({ phase: 'armed', a: null, b: null });
  });

  it('Esc while armed disarms the tool', () => {
    expect(measureReducer(armed(), { type: 'escape' })).toEqual(initialMeasureState);
  });

  it('Esc does not dismiss a pinned measurement', () => {
    const s = pinned();
    expect(measureReducer(s, { type: 'escape' })).toBe(s);
  });

  it('toggle dismisses a pinned measurement without re-arming', () => {
    expect(measureReducer(pinned(), { type: 'toggle' })).toEqual(initialMeasureState);
  });

  it('toggle while in progress removes the partial measurement and disarms', () => {
    expect(measureReducer(armed(), { type: 'toggle' })).toEqual(initialMeasureState);
    expect(measureReducer(rubberband(), { type: 'toggle' })).toEqual(initialMeasureState);
  });

  it('starting another map mode cancels a measurement in progress', () => {
    expect(measureReducer(armed(), { type: 'otherModeStarted' })).toEqual(initialMeasureState);
    expect(measureReducer(rubberband(), { type: 'otherModeStarted' })).toEqual(initialMeasureState);
  });

  it('starting another map mode keeps a pinned measurement', () => {
    const s = pinned();
    expect(measureReducer(s, { type: 'otherModeStarted' })).toBe(s);
  });

  it('reset discards any measurement', () => {
    expect(measureReducer(pinned(), { type: 'reset' })).toEqual(initialMeasureState);
    expect(measureReducer(rubberband(), { type: 'reset' })).toEqual(initialMeasureState);
    expect(measureReducer(initialMeasureState, { type: 'reset' })).toBe(initialMeasureState);
  });
});
