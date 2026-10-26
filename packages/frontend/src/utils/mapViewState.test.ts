import { describe, it, expect, beforeEach } from 'vitest';
import View from 'ol/View';
import { get as getProjection, transform } from 'ol/proj';
import { closestResolution, saveMapViewState, getMapViewState, clearMapViewState } from './mapViewState';
import { createMapProjection } from './projectionUtils';

describe('closestResolution', () => {
  const resolutions = [1600, 800, 400, 200, 100];

  it('picks the closest resolution by ratio', () => {
    expect(closestResolution(resolutions, 390)).toBe(400);
    // By ratio, 290 is nearer 400 (×1.38) than 200 (×1.45), though nearer 200 in absolute terms.
    expect(closestResolution(resolutions, 290)).toBe(400);
    expect(closestResolution(resolutions, 270)).toBe(200);
  });

  it('clamps to the ends of the range', () => {
    expect(closestResolution(resolutions, 10)).toBe(100);
    expect(closestResolution(resolutions, 1e6)).toBe(1600);
  });
});

describe('map view state across projections', () => {
  const mercator = getProjection('EPSG:3857')!;
  const { projection: tmerc } = createMapProjection('transverse_mercator', 42, 0, 0);
  const lonLat: [number, number] = [42.48, 42.18]; // Kutaisi

  beforeEach(() => clearMapViewState());

  it('restores the same view on the same map', () => {
    const resolutions = [800, 400, 200, 100];
    const center = transform(lonLat, 'EPSG:4326', 'EPSG:3857');
    saveMapViewState(new View({ projection: mercator, center, resolution: 200 }), 'caucasus');

    const restored = getMapViewState('caucasus', mercator, resolutions)!;
    expect(restored.resolution).toBe(200);
    expect(restored.center[0]).toBeCloseTo(center[0], 3);
    expect(restored.center[1]).toBeCloseTo(center[1], 3);
  });

  it('keeps the geographic centre and ground scale when the projection changes', () => {
    const center = transform(lonLat, 'EPSG:4326', 'EPSG:3857');
    // 200 m/px in EPSG:3857 at 42°N is about 148 ground metres per pixel.
    saveMapViewState(new View({ projection: mercator, center, resolution: 200 }), 'caucasus');

    const restored = getMapViewState('caucasus', tmerc, [400, 300, 150, 75])!;
    const [lon, lat] = transform(restored.center, (tmerc as any).getCode(), 'EPSG:4326');
    expect(lon).toBeCloseTo(lonLat[0], 6);
    expect(lat).toBeCloseTo(lonLat[1], 6);
    expect(restored.resolution).toBe(150); // scale-matched, not zoom-index-matched
  });

  it('returns nothing for another key', () => {
    saveMapViewState(new View({ projection: mercator, center: [0, 0], resolution: 200 }), 'caucasus');
    expect(getMapViewState('syria', mercator, [200])).toBeNull();
  });
});
