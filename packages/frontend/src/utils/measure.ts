import { calculateBearing, calculateDistanceM } from './legCalculations';
import type { TheatreNavigation } from '../hooks/useTheatreNavigation';

/**
 * The Measure tool (map-measure): a transient A → B bearing/distance aid.
 * Nothing here touches the flight plan; measurements are never stored.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Measurement {
  /** Magnetic bearing A → B, degrees [0, 360). */
  bearing: number;
  /** Magnetic bearing B → A, degrees [0, 360). */
  reciprocal: number;
  distanceNm: number;
}

// Declination is East-positive: magnetic = true - declination (leg-geometry).
const toMagnetic = (trueDeg: number, declination: number) => (trueDeg - declination + 360) % 360;

/**
 * Bearing and distance from A to B, computed exactly like a leg's straight
 * segment: same navigation mode and projection, same declination convention.
 * The reciprocal is the real B → A bearing, not bearing + 180, so it stays
 * correct over long distances in geographic mode.
 */
export function computeMeasurement(a: LatLon, b: LatLon, navigation: TheatreNavigation, declination: number): Measurement {
  const { navigationMode, projection } = navigation;
  const forward = calculateBearing(a.lat, a.lon, b.lat, b.lon, navigationMode, projection);
  const back = calculateBearing(b.lat, b.lon, a.lat, a.lon, navigationMode, projection);
  const distanceM = calculateDistanceM(a.lat, a.lon, b.lat, b.lon, navigationMode, projection);
  return {
    bearing: toMagnetic(forward, declination),
    reciprocal: toMagnetic(back, declination),
    distanceNm: distanceM / 1852,
  };
}

export interface MeasurementText {
  /** Directional A → B readout, e.g. `087°M  23.4 NM`. */
  primary: string;
  /** Reciprocal bearing, shown subdued, e.g. `(267°M)`. */
  secondary: string;
}

// Whole degrees, three digits; 359.6 rounds to 360 and shows as 000.
const formatBearing = (deg: number) => (Math.round(deg) % 360).toString().padStart(3, '0') + '°M';

export function formatMeasurement(m: Measurement): MeasurementText {
  return {
    primary: `${formatBearing(m.bearing)}  ${m.distanceNm.toFixed(1)} NM`,
    secondary: `(${formatBearing(m.reciprocal)})`,
  };
}

/** Map-projection coordinate. */
export type MapCoord = [number, number];

/**
 * idle → armed (tool on, no point) → rubberband (A placed, B follows the
 * cursor) → pinned (B placed, map back to normal interaction).
 */
export type MeasurePhase = 'idle' | 'armed' | 'rubberband' | 'pinned';

export interface MeasureState {
  phase: MeasurePhase;
  a: MapCoord | null;
  b: MapCoord | null;
}

export type MeasureEvent =
  | { type: 'toggle' }                 // Measure button or M
  | { type: 'click'; coord: MapCoord }
  | { type: 'move'; coord: MapCoord }
  | { type: 'escape' }
  | { type: 'otherModeStarted' }       // waypoint drawing or add-marker placement started
  | { type: 'reset' };                 // plan or map changed

export const initialMeasureState: MeasureState = { phase: 'idle', a: null, b: null };

/** While measuring, map clicks place measure points and nothing else. */
export const isMeasuring = (phase: MeasurePhase) => phase === 'armed' || phase === 'rubberband';

/** No-op events return the same state object so React skips the render. */
export function measureReducer(state: MeasureState, event: MeasureEvent): MeasureState {
  switch (event.type) {
    case 'toggle':
      return state.phase === 'idle' ? { phase: 'armed', a: null, b: null } : initialMeasureState;
    case 'click':
      if (state.phase === 'armed') return { phase: 'rubberband', a: event.coord, b: event.coord };
      if (state.phase === 'rubberband') return { ...state, phase: 'pinned', b: event.coord };
      return state;
    case 'move':
      return state.phase === 'rubberband' ? { ...state, b: event.coord } : state;
    case 'escape':
      // Esc only cancels a measurement in progress, one step at a time; a pinned one stays
      if (state.phase === 'rubberband') return { phase: 'armed', a: null, b: null };
      if (state.phase === 'armed') return initialMeasureState;
      return state;
    case 'otherModeStarted':
      return isMeasuring(state.phase) ? initialMeasureState : state;
    case 'reset':
      return state.phase === 'idle' ? state : initialMeasureState;
  }
}
