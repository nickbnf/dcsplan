import type Map from 'ol/Map';
import type { FlightPlan } from '../types/flightPlan';
import { transform } from 'ol/proj';
import { boundingExtent } from 'ol/extent';

type MapViewState = { center: [number, number]; zoom: number; theatre: string };

let savedViewState: MapViewState | null = null;

export function saveMapViewState(center: [number, number], zoom: number, theatre: string): void {
  savedViewState = { center, zoom, theatre };
}

export function getMapViewState(theatre: string): { center: [number, number]; zoom: number } | null {
  if (savedViewState && savedViewState.theatre === theatre) {
    return { center: savedViewState.center, zoom: savedViewState.zoom };
  }
  return null;
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
