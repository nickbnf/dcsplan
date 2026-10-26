import type Map from 'ol/Map';
import type View from 'ol/View';
import type { FlightPlan } from '../types/flightPlan';
import { transform, getPointResolution } from 'ol/proj';
import { boundingExtent } from 'ol/extent';

// The view is kept in projection-independent terms (add-theatre-maps D6): a
// lat/lon centre and a ground scale in metres per pixel at that centre. A view
// saved on one map then restores at the same place and a similar scale on a
// map with another projection or another set of zoom levels.
type MapViewState = { centerLonLat: [number, number]; metresPerPixel: number; key: string };

let savedViewState: MapViewState | null = null;

export function saveMapViewState(view: View, key: string): void {
  const center = view.getCenter();
  const resolution = view.getResolution();
  if (!center || resolution === undefined) return;
  const projection = view.getProjection();
  savedViewState = {
    centerLonLat: transform(center, projection.getCode(), 'EPSG:4326') as [number, number],
    metresPerPixel: getPointResolution(projection, resolution, center, 'm'),
    key,
  };
}

/**
 * The saved view for `key`, expressed in `projection`: its centre, and the
 * resolution among `resolutions` whose ground scale is closest to the saved one.
 */
export function getMapViewState(
  key: string,
  projection: any,
  resolutions: number[],
): { center: [number, number]; resolution: number } | null {
  if (!savedViewState || savedViewState.key !== key || resolutions.length === 0) {
    return null;
  }
  const center = transform(savedViewState.centerLonLat, 'EPSG:4326', projection.getCode()) as [number, number];
  // Ground metres per projection unit at the centre, to compare scales across projections.
  const metresPerUnit = getPointResolution(projection, 1, center, 'm');
  const resolution = closestResolution(resolutions, savedViewState.metresPerPixel / metresPerUnit);
  return { center, resolution };
}

/**
 * The resolution in `resolutions` closest in scale to `target` (by ratio, since
 * zoom levels are geometric); clamps to the ends of the range.
 */
export function closestResolution(resolutions: number[], target: number): number {
  const distance = (r: number) => Math.abs(Math.log(r / target));
  return resolutions.reduce((best, r) => (distance(r) < distance(best) ? r : best));
}

export function clearMapViewState(): void {
  savedViewState = null;
}

// Fits the map view to show all flight plan points with padding
export function fitMapToFlightPlan(map: Map, flightPlan: FlightPlan, projection: any): void {
  if (flightPlan.points.length === 0) return;

  const projectedCoords = flightPlan.points.map(p =>
    transform([p.lon, p.lat], 'EPSG:4326', projection.getCode())
  );

  if (flightPlan.points.length === 1) {
    map.getView().animate({
      center: projectedCoords[0],
      zoom: Math.min(7, map.getView().getMaxZoom()),
      duration: 300,
    });
    return;
  }

  const extent = boundingExtent(projectedCoords);
  map.getView().fit(extent, {
    padding: [50, 50, 50, 50],
    maxZoom: map.getView().getMaxZoom(),
    duration: 300,
  });
}
