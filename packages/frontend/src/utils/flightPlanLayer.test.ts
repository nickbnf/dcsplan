import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { get as getProjection, transform } from 'ol/proj';
import type { LineString } from 'ol/geom';
import { createFlightPlanLayer } from './flightPlanLayer';
import { calculateAllLegDrawData, generateArcPoints } from './legCalculations';
import { createNavigation } from '../hooks/useTheatreNavigation';
import type { FlightPlan } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

// add-theatre-maps D4: geometry from the theatre's navigation settings,
// placement on the displayed map's projection.
const plans: FlightPlan[] = JSON.parse(readFileSync(resolve(__dirname, '../../../shared/theatre-golden/plans.json'), 'utf-8'));
const germany = plans.find(p => p.theatre === 'germany')!;
const navigation = createNavigation({ mode: 'projected', projection: 'transverse_mercator', central_meridian: 21 });
const display = getProjection('EPSG:3857')!;

const toDisplay = ([lat, lon]: [number, number]) => transform([lon, lat], 'EPSG:4326', 'EPSG:3857');

function flightLines() {
  const layer = createFlightPlanLayer(germany, display, navigation, defaultAircraft());
  return layer.getSource()!.getFeatures()
    .filter(f => f.get('type') === 'flightline')
    .sort((a, b) => a.get('startIndex') - b.get('startIndex'))
    .map(f => (f.getGeometry() as LineString).getCoordinates());
}

describe('createFlightPlanLayer with a display projection different from navigation', () => {
  const draw = calculateAllLegDrawData(germany, navigation.projection, navigation.navigationMode, defaultAircraft());
  const lines = flightLines();

  it('draws one line per leg', () => {
    expect(lines).toHaveLength(germany.points.length - 1);
  });

  it('places turn arcs computed with the navigation projection', () => {
    for (let i = 1; i < lines.length; i++) {
      const leg = draw[i];
      const arc = generateArcPoints(
        leg.turnCenterLat, leg.turnCenterLon, leg.turnRadiusM,
        leg.originLat, leg.originLon, leg.straighteningLat, leg.straighteningLon,
        leg.turnDirection, navigation.projection, 30,
      ).map(toDisplay);
      expect(lines[i].slice(0, arc.length)).toEqual(arc);
    }
  });

  it("draws each leg's straight part as a two-point segment from the navigation straightening point", () => {
    lines.forEach((coords, i) => {
      const leg = draw[i];
      const [straightStart, destination] = coords.slice(-2);
      // On turning legs the arc's last point is the straightening point after a
      // projection round trip, so compare to the millimetre.
      const expectedStart = toDisplay([leg.straighteningLat, leg.straighteningLon]);
      expect(straightStart[0]).toBeCloseTo(expectedStart[0], 3);
      expect(straightStart[1]).toBeCloseTo(expectedStart[1], 3);
      expect(destination).toEqual(toDisplay([leg.destinationLat, leg.destinationLon]));
    });
  });
});

describe('createFlightPlanLayer with the resolved profile', () => {
  // leg-geometry: a bound leg's turn is flown at the regime's cruise TAS
  const bound: FlightPlan = {
    ...germany,
    points: germany.points.map((p, i) => (i === 2 ? { ...p, regimeId: 'fast' } : p)),
  };
  const lines = (aircraft: ReturnType<typeof defaultAircraft>) =>
    createFlightPlanLayer(bound, display, navigation, aircraft).getSource()!.getFeatures()
      .filter(f => f.get('type') === 'flightline')
      .sort((a, b) => a.get('startIndex') - b.get('startIndex'))
      .map(f => (f.getGeometry() as LineString).getCoordinates());

  it("redraws a bound leg's turn when the regime's cruise TAS differs from the stored TAS", () => {
    const withRegime = {
      ...defaultAircraft(),
      regimes: [{ id: 'fast', name: 'Fast', cruise: { tas: bound.points[2].tas + 150, ff: 5000 } }],
    };
    expect(lines(withRegime)[1]).not.toEqual(lines(defaultAircraft())[1]);
    expect(lines(withRegime)[0]).toEqual(lines(defaultAircraft())[0]);
  });
});

describe('createFlightPlanLayer with a runway departure', () => {
  const lineOf = (plan: FlightPlan) =>
    (createFlightPlanLayer(plan, display, navigation, defaultAircraft()).getSource()!.getFeatures()
      .find(f => f.get('type') === 'flightline' && f.get('startIndex') === 0)!
      .getGeometry() as LineString).getCoordinates();

  it('draws leg 1 down the runway, through the turn, to WP1', () => {
    const withRunway: FlightPlan = { ...germany, points: [{ ...germany.points[0], runway: 9 }, ...germany.points.slice(1)] };
    const coords = lineOf(withRunway);
    const [wp0, wp1] = [germany.points[0], germany.points[1]];
    expect(coords[0]).toEqual(toDisplay([wp0.lat, wp0.lon]));
    expect(coords[coords.length - 1]).toEqual(toDisplay([wp1.lat, wp1.lon]));
    expect(coords.length).toBeGreaterThan(3);
    // The second point lies along the runway true heading (090 + declination) in the navigation frame
    const nav = navigation.projection.getCode();
    const [ox, oy] = transform([wp0.lon, wp0.lat], 'EPSG:4326', nav);
    const [sx, sy] = transform(transform(coords[1], 'EPSG:3857', 'EPSG:4326'), 'EPSG:4326', nav);
    const brg = (Math.atan2(sx - ox, sy - oy) * 180 / Math.PI + 360) % 360;
    expect(brg).toBeCloseTo((90 + withRunway.declination + 360) % 360, 4);
  });

  it('draws leg 1 as before without a runway', () => {
    expect(lineOf(germany)).toHaveLength(3);
  });
});
