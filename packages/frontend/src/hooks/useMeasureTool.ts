import { useCallback, useEffect, useReducer, useRef } from 'react';
import type Map from 'ol/Map';
import Overlay from 'ol/Overlay';
import Feature from 'ol/Feature';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { LineString, Point } from 'ol/geom';
import { Circle, Fill, RegularShape, Stroke, Style } from 'ol/style';
import { transform } from 'ol/proj';
import type { TheatreNavigation } from './useTheatreNavigation';
import { PREVIEW_LINE_COLOR, PREVIEW_LINE_STYLES } from './useDrawing';
import {
  computeMeasurement,
  formatMeasurement,
  initialMeasureState,
  measureReducer,
} from '../utils/measure';
import type { MapCoord, MeasurePhase } from '../utils/measure';

// The measure line looks exactly like the waypoint preview line
const MEASURE_COLOR = PREVIEW_LINE_COLOR;

const startStyle = new Style({
  image: new Circle({
    radius: 5,
    fill: new Fill({ color: 'rgba(255,255,255,0.9)' }),
    stroke: new Stroke({ color: MEASURE_COLOR, width: 2.5 }),
  }),
});

// Arrowhead at B, pointing from A to B so the measurement reads as a vector
const arrowStyle = (rotation: number) => new Style({
  image: new RegularShape({
    points: 3,
    radius: 8,
    rotation,
    rotateWithView: true,
    fill: new Fill({ color: MEASURE_COLOR }),
    stroke: new Stroke({ color: 'rgba(255,255,255,0.9)', width: 1.5 }),
  }),
});

interface UseMeasureToolOptions {
  /** The theatre's navigation settings, used exactly as for legs (map-measure). */
  navigation: TheatreNavigation | null;
  declination: number;
  /** Any change discards the measurement (e.g. another plan opened). */
  resetKey: unknown;
}

/**
 * Transient bearing/distance tool for the planner map (map-measure). Owns the
 * phase, a dedicated vector layer and the readout overlay; never touches the
 * flight plan.
 */
export const useMeasureTool = ({ navigation, declination, resetKey }: UseMeasureToolOptions) => {
  const [state, dispatch] = useReducer(measureReducer, initialMeasureState);

  // Handlers registered on the OL map read the phase through this ref (design D2)
  const phaseRef = useRef<MeasurePhase>(state.phase);
  phaseRef.current = state.phase;

  const mapRef = useRef<Map | null>(null);
  const sourceRef = useRef<VectorSource | null>(null);
  const overlayRef = useRef<Overlay | null>(null);
  const primaryRef = useRef<HTMLSpanElement | null>(null);
  const secondaryRef = useRef<HTMLSpanElement | null>(null);

  /**
   * Install the measure layer and readout on a freshly built map. Called by the
   * map-building effect; a new map discards any previous measurement.
   */
  const attach = useCallback((map: Map) => {
    const source = new VectorSource();
    const layer = new VectorLayer({ source, zIndex: 100 });
    layer.set('name', 'measure');
    map.addLayer(layer);

    const element = document.createElement('div');
    element.className = 'pointer-events-none select-none whitespace-pre bg-gray-900 bg-opacity-80 text-white text-xs font-aero-label rounded px-2 py-1';
    const primary = document.createElement('span');
    const secondary = document.createElement('span');
    secondary.className = 'ml-2 text-white/60';
    element.append(primary, secondary);
    const overlay = new Overlay({ element, positioning: 'bottom-center', offset: [0, -8], stopEvent: false });
    map.addOverlay(overlay);

    mapRef.current = map;
    sourceRef.current = source;
    overlayRef.current = overlay;
    primaryRef.current = primary;
    secondaryRef.current = secondary;
    dispatch({ type: 'reset' });
  }, []);

  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [resetKey]);

  // Render the current measurement into the layer and the readout
  useEffect(() => {
    const map = mapRef.current;
    const source = sourceRef.current;
    const overlay = overlayRef.current;
    if (!map || !source || !overlay) return;

    source.clear();
    const { a, b } = state;
    if (!a || !b || !navigation) {
      overlay.setPosition(undefined);
      return;
    }

    const line = new Feature({ geometry: new LineString([a, b]) });
    line.setStyle(PREVIEW_LINE_STYLES);
    source.addFeature(line);
    const start = new Feature({ geometry: new Point(a) });
    start.setStyle(startStyle);
    source.addFeature(start);

    if (a[0] === b[0] && a[1] === b[1]) {
      // Just placed A: nothing to measure yet
      overlay.setPosition(undefined);
      return;
    }

    const end = new Feature({ geometry: new Point(b) });
    end.setStyle(arrowStyle(Math.atan2(b[0] - a[0], b[1] - a[1])));
    source.addFeature(end);

    const code = map.getView().getProjection().getCode();
    const toLatLon = (c: MapCoord) => {
      const [lon, lat] = transform(c, code, 'EPSG:4326');
      return { lat, lon };
    };
    const text = formatMeasurement(computeMeasurement(toLatLon(a), toLatLon(b), navigation, declination));
    primaryRef.current!.textContent = text.primary;
    secondaryRef.current!.textContent = text.secondary;
    overlay.setPosition([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }, [state, navigation, declination]);

  return { phase: state.phase, phaseRef, dispatch, attach };
};
