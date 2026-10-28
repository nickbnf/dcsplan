/**
 * Projection parity (georeference-control-points D6): every map's control points
 * projected with proj4js must land where pyproj (backend, kneeboard) puts them.
 * The expected values are written by packages/backend/test_map_georeference.py
 * under UPDATE_GOLDEN=1.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { transform } from 'ol/proj';
import { createProjectionFromCrs } from './projectionUtils';

interface ProjectedControlPoint {
  label: string;
  lat: number;
  lon: number;
  x: number;
  y: number;
}

const FIXTURE_PATH = resolve(__dirname, '../../../shared/map-georeference/projected-control-points.json');
const fixture: Record<string, { crs: string; points: ProjectedControlPoint[] }> = JSON.parse(
  readFileSync(FIXTURE_PATH, 'utf-8')
);

describe('map projection parity with pyproj', () => {
  it('has at least one map', () => {
    expect(Object.keys(fixture).length).toBeGreaterThan(0);
  });

  describe.each(Object.entries(fixture))('%s', (name, { crs, points }) => {
    const { projection } = createProjectionFromCrs(`map:parity/${name}`, crs);

    it.each(points.map((p) => [p.label, p] as const))('%s', (_label, point) => {
      const [x, y] = transform([point.lon, point.lat], 'EPSG:4326', projection);
      expect(Math.abs(x - point.x)).toBeLessThan(0.01);
      expect(Math.abs(y - point.y)).toBeLessThan(0.01);
    });
  });
});
