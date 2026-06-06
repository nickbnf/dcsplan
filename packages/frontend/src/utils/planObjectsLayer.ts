import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import CircleGeom from 'ol/geom/Circle';
import { Style, Icon, Stroke, Fill } from 'ol/style';
import { transform } from 'ol/proj';
import type { PlanLibraryRef, PlanMarker, LibraryObject } from '../types/flightPlan';
import { getPictogramDataUrl, isRangedType } from './pictogramCatalog';

const SELECTED_COLOR = '#FFB300';
const OBJECTS_COLOR = '#A21CAF';
const GHOST_COLOR = '#9CA3AF';
const ICON_SIZE = 36;
const NM_TO_METERS = 1852;

/** Coloured in-plan pictogram source (refs + markers). */
export function buildPlanObjectsSource(
  refs: PlanLibraryRef[],
  markers: PlanMarker[],
  library: LibraryObject[],
  projection: any,
  selectedId: string | null
): VectorSource {
  const source = new VectorSource();
  const projCode = projection.getCode();

  for (const ref_ of refs) {
    const entry = library.find(e => e.id === ref_.uuid);
    if (!entry) continue;
    const [x, y] = transform([entry.lon, entry.lat], 'EPSG:4326', projCode);
    const color = selectedId === ref_.uuid ? SELECTED_COLOR : OBJECTS_COLOR;
    const f = new Feature({ geometry: new Point([x, y]) });
    f.set('objectId', ref_.uuid);
    f.set('objectKind', 'ref');
    f.setStyle(new Style({ image: new Icon({ src: getPictogramDataUrl(entry.type, color, ICON_SIZE), anchor: [0.5, 0.5] }) }));
    source.addFeature(f);
  }

  for (const marker of markers) {
    const [x, y] = transform([marker.lon, marker.lat], 'EPSG:4326', projCode);
    const color = selectedId === marker.id ? SELECTED_COLOR : OBJECTS_COLOR;
    const f = new Feature({ geometry: new Point([x, y]) });
    f.set('objectId', marker.id);
    f.set('objectKind', 'marker');
    f.setStyle(new Style({ image: new Icon({ src: getPictogramDataUrl(marker.type, color, ICON_SIZE), anchor: [0.5, 0.5] }) }));
    source.addFeature(f);
  }

  return source;
}

/** Threat range ring source for ranged in-plan objects. */
export function buildThreatRingsSource(
  refs: PlanLibraryRef[],
  markers: PlanMarker[],
  library: LibraryObject[],
  projection: any
): VectorSource {
  const source = new VectorSource();
  const projCode = projection.getCode();

  for (const ref_ of refs) {
    const entry = library.find(e => e.id === ref_.uuid);
    if (!entry || !isRangedType(entry.type) || !entry.range) continue;
    const [x, y] = transform([entry.lon, entry.lat], 'EPSG:4326', projCode);
    const f = new Feature({ geometry: new CircleGeom([x, y], entry.range * NM_TO_METERS) });
    f.setStyle(new Style({
      stroke: new Stroke({ color: 'rgba(239,68,68,0.6)', width: 1.5, lineDash: [6, 4] }),
      fill: new Fill({ color: 'rgba(239,68,68,0.08)' }),
    }));
    source.addFeature(f);
  }

  for (const marker of markers) {
    if (!isRangedType(marker.type) || !marker.range) continue;
    const [x, y] = transform([marker.lon, marker.lat], 'EPSG:4326', projCode);
    const f = new Feature({ geometry: new CircleGeom([x, y], marker.range * NM_TO_METERS) });
    f.setStyle(new Style({
      stroke: new Stroke({ color: 'rgba(239,68,68,0.6)', width: 1.5, lineDash: [6, 4] }),
      fill: new Fill({ color: 'rgba(239,68,68,0.08)' }),
    }));
    source.addFeature(f);
  }

  return source;
}

/** Greyed library ghost source — all library entries (plan-referenced ones get
 *  a coloured icon rendered on top via the higher-z planobjects layer). */
export function buildLibraryGhostsSource(
  library: LibraryObject[],
  _refs: PlanLibraryRef[],
  projection: any
): VectorSource {
  const source = new VectorSource();
  const projCode = projection.getCode();

  for (const entry of library) {
    const [x, y] = transform([entry.lon, entry.lat], 'EPSG:4326', projCode);
    const f = new Feature({ geometry: new Point([x, y]) });
    f.set('ghostId', entry.id);
    f.set('ghostName', entry.name ?? '');
    f.setStyle(new Style({ image: new Icon({ src: getPictogramDataUrl(entry.type, GHOST_COLOR, ICON_SIZE), anchor: [0.5, 0.5] }) }));
    source.addFeature(f);
  }

  return source;
}

export function createPlanObjectsLayer(
  refs: PlanLibraryRef[],
  markers: PlanMarker[],
  library: LibraryObject[],
  projection: any,
  selectedId: string | null
): VectorLayer<any> {
  return new VectorLayer({ source: buildPlanObjectsSource(refs, markers, library, projection, selectedId) });
}

export function createThreatRingsLayer(
  refs: PlanLibraryRef[],
  markers: PlanMarker[],
  library: LibraryObject[],
  projection: any
): VectorLayer<any> {
  return new VectorLayer({ source: buildThreatRingsSource(refs, markers, library, projection) });
}

export function createLibraryGhostsLayer(
  library: LibraryObject[],
  refs: PlanLibraryRef[],
  projection: any
): VectorLayer<any> {
  return new VectorLayer({ source: buildLibraryGhostsSource(library, refs, projection) });
}
