import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { get as getProjection, transform } from 'ol/proj';
import type { LineString } from 'ol/geom';
import { createFlightPlanLayer } from './flightPlanLayer';
import { calculateAllLegDrawData, generateArcPoints } from './legCalculations';
import { createNavigation } from '../hooks/useTheatreNavigation';
import type { FlightPlan } from '../types/flightPlan';

// add-theatre-maps D4: geometry from the theatre's navigation settings,
// placement on the displayed map's projection.
const plans: FlightPlan[] = JSON.parse(readFileSync(resolve(__dirname, '../../../shared/theatre-golden/plans.json'), 'utf-8'));
const germany = plans.find(p => p.theatre === 'germany')!;
const navigation = createNavigation({ mode: 'projected', projection: 'transverse_mercator', central_meridian: 21 });
const display = getProjection('EPSG:3857')!;

const toDisplay = ([lat, lon]: [number, number]) => transform([lon, lat], 'EPSG:4326', 'EPSG:3857');

function flightLines() {
  const layer = createFlightPlanLayer(germany, display, navigation);
  return layer.getSource()!.getFeatures()
    .filter(f => f.get('type') === 'flightline')
    .sort((a, b) => a.get('startIndex') - b.get('startIndex'))
    .map(f => (f.getGeometry() as LineString).getCoordinates());
}

describe('createFlightPlanLayer with a display projection different from navigation', () => {
  const draw = calculateAllLegDrawData(germany, navigation.projection, navigation.navigationMode);
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
