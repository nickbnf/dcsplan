import React, { useRef, useEffect, useState, useCallback } from 'react';
import 'ol/ol.css';
import OlMap from 'ol/Map';
import View from 'ol/View';
import { transform, transformExtent } from 'ol/proj';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import { Style, Icon } from 'ol/style';
import Modify from 'ol/interaction/Modify';
import Collection from 'ol/Collection';
import { createMapProjection, transformBoundsToTransverseMercator, calculateTransverseMercatorCenter } from '../utils/projectionUtils';
import { createTileLayer, calculateResolutions } from '../utils/tileLayer';
import type { MapInfo } from '../utils/tileLayer';
import { createGridLayer } from '../utils/latLonGrid';
import { getApiUrl, getTilesBaseUrl } from '../config/api';
import { MapCoordinatesOverlay } from './MapCoordinatesOverlay';
import { useLibrarySelection } from '../contexts/LibrarySelectionContext';
import { initCoordEntry, applyKey, parseCoordEntry, formatTemplate } from '../utils/coordEntryUtils';
import { getPictogramDataUrl } from '../utils/pictogramCatalog';
import type { LibraryObject } from '../types/flightPlan';
import { DisplayButton } from './map/DisplayButton';
import { saveMapViewState, getMapViewState } from '../utils/mapViewState';

const SELECTED_COLOR = '#FFB300';
const DEFAULT_COLOR = '#D946EF';
const ICON_SIZE = 36;
const HIT_TOLERANCE = 8;

interface LibraryMapProps {
  theatre: string;
  entries: LibraryObject[];
  onEntryMove: (id: string, lat: number, lon: number) => void;
  onEntryCreate?: (lat: number, lon: number) => void; // when in placement mode
  isPlacementMode?: boolean;
  fitTrigger?: number;
}

const LibraryMap: React.FC<LibraryMapProps> = ({
  theatre,
  entries,
  onEntryMove,
  onEntryCreate,
  isPlacementMode = false,
  fitTrigger = 0,
}) => {
  const { selectedId, setSelectedId, coordEntry, setCoordEntry } = useLibrarySelection();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<OlMap | null>(null);
  const pictogramLayerRef = useRef<VectorLayer<any> | null>(null);
  const modifyRef = useRef<Modify | null>(null);
  const [mapInfo, setMapInfo] = useState<MapInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hoverCoord, setHoverCoord] = useState<{ raw_x: number; raw_y: number; lat: number; lon: number } | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const lastFitTriggerRef = useRef(fitTrigger);
  const gridLayerRef = useRef<VectorLayer | null>(null);
  const entriesRef = useRef(entries);
  const selectedIdRef = useRef(selectedId);
  const isPlacementModeRef = useRef(isPlacementMode);
  const onEntryCreateRef = useRef(onEntryCreate);
  entriesRef.current = entries;
  selectedIdRef.current = selectedId;
  isPlacementModeRef.current = isPlacementMode;
  onEntryCreateRef.current = onEntryCreate;

  // ── Fetch map info ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetch(getApiUrl(`theatres/${theatre}.json`), { signal: AbortSignal.timeout(10000) })
      .then(r => r.json())
      .then(data => { if (!cancelled) setMapInfo(data as MapInfo); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [theatre]);

  // ── Build pictogram layer ─────────────────────────────────────────────────
  const buildPictogramSource = useCallback((projection: any) => {
    const source = new VectorSource();
    entriesRef.current.forEach(entry => {
      const [x, y] = transform([entry.lon, entry.lat], 'EPSG:4326', projection.getCode());
      const isSelected = entry.id === selectedIdRef.current;
      const color = isSelected ? SELECTED_COLOR : DEFAULT_COLOR;
      const feature = new Feature({
        geometry: new Point([x, y]),
        libraryId: entry.id,
        entryType: entry.type,
      });
      feature.setStyle(new Style({
        image: new Icon({
          src: getPictogramDataUrl(entry.type, color, ICON_SIZE),
          anchor: [0.5, 0.5],
        }),
      }));
      source.addFeature(feature);
    });
    return source;
  }, []);

  const refreshPictogramLayer = useCallback(() => {
    if (!mapInstanceRef.current || !pictogramLayerRef.current) return;
    const proj = mapInstanceRef.current.getView().getProjection();
    const source = buildPictogramSource(proj);
    pictogramLayerRef.current.setSource(source);

    // Re-attach modify interaction
    if (modifyRef.current) {
      mapInstanceRef.current.removeInteraction(modifyRef.current);
    }
    const features = source.getFeatures().filter(f => f.get('libraryId'));
    if (features.length > 0) {
      const modify = new Modify({ features: new Collection(features), style: () => [] });
      modify.on('modifyend', (event: any) => {
        event.features.getArray().forEach((feat: any) => {
          const id = feat.get('libraryId');
          if (!id) return;
          const coords = (feat.getGeometry() as Point).getCoordinates();
          const [lon, lat] = transform(coords, mapInstanceRef.current!.getView().getProjection().getCode(), 'EPSG:4326');
          onEntryMove(id, lat, lon);
        });
      });
      mapInstanceRef.current.addInteraction(modify);
      modifyRef.current = modify;
    }
  }, [buildPictogramSource, onEntryMove]);

  // ── Initialise map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInfo || !mapRef.current || isLoading) return;

    const regionBounds = mapInfo.bounds;
    const { projection: mapProjection } = createMapProjection(
      mapInfo.projection,
      mapInfo.central_meridian,
      mapInfo.std_parallel1,
      mapInfo.std_parallel2
    );
    const extent = transformBoundsToTransverseMercator(regionBounds, mapProjection);
    (mapProjection as any).setExtent(extent);
    const center = calculateTransverseMercatorCenter(regionBounds, mapProjection);
    const resolutions = calculateResolutions(mapInfo, mapProjection);

    const tileLayer = createTileLayer(mapInfo, mapProjection, getTilesBaseUrl(theatre));
    const gridLayer = createGridLayer(regionBounds, mapProjection);
    gridLayer.set('name', 'grid');
    gridLayerRef.current = gridLayer;
    gridLayer.setVisible(gridEnabled);

    const pictogramSource = buildPictogramSource(mapProjection);
    const pictogramLayer = new VectorLayer({ source: pictogramSource, zIndex: 10 });
    pictogramLayer.set('name', 'pictograms');
    pictogramLayerRef.current = pictogramLayer;

    const savedState = getMapViewState(`library_${theatre}`);

    const map = new OlMap({
      target: mapRef.current,
      pixelRatio: 1,
      layers: [tileLayer, gridLayer, pictogramLayer],
      view: new View({
        projection: mapProjection as any,
        center: savedState ? savedState.center : center,
        zoom: savedState ? savedState.zoom : 2,
        resolutions,
        constrainResolution: true,
        multiWorld: false,
      }),
    });
    mapInstanceRef.current = map;

    // Auto-fit to entries if no saved state and entries exist
    if (!savedState && entriesRef.current.length > 0) {
      fitToEntries(map, mapProjection);
    }

    // Save view state on move
    map.getView().on('change', () => {
      const c = map.getView().getCenter();
      const z = map.getView().getZoom();
      if (c && z !== undefined) saveMapViewState(c as [number, number], z, `library_${theatre}`);
    });

    // Hover tracking
    map.on('pointermove', (e) => {
      const [lon, lat] = transform(
        map.getCoordinateFromPixel(e.pixel),
        map.getView().getProjection().getCode(),
        'EPSG:4326'
      );
      setHoverCoord({ lat, lon, raw_x: e.pixel[0], raw_y: e.pixel[1] });
    });

    // Click: select entry or deselect on background
    map.on('click', (e) => {
      if (coordEntry !== null) return;
      const feature = map.forEachFeatureAtPixel(
        e.pixel,
        f => f,
        { hitTolerance: HIT_TOLERANCE }
      );
      const id = feature?.get('libraryId') as string | undefined;
      if (id) {
        setSelectedId(id === selectedIdRef.current ? null : id);
      } else if (isPlacementModeRef.current && onEntryCreateRef.current) {
        // Placement mode: create new entry at click position
        const coord = map.getCoordinateFromPixel(e.pixel);
        const [lon, lat] = transform(coord, map.getView().getProjection().getCode(), 'EPSG:4326');
        onEntryCreateRef.current(lat, lon);
      } else {
        setSelectedId(null);
      }
    });

    // Cursor style
    map.on('pointermove', (e) => {
      const feature = map.forEachFeatureAtPixel(e.pixel, f => f, { hitTolerance: HIT_TOLERANCE });
      const target = map.getTargetElement() as HTMLElement;
      if (feature?.get('libraryId')) {
        target.style.cursor = 'pointer';
      } else if (isPlacementModeRef.current) {
        target.style.cursor = 'crosshair';
      } else {
        target.style.cursor = '';
      }
    });

    // Attach modify interaction
    const features = pictogramSource.getFeatures();
    if (features.length > 0) {
      const modify = new Modify({ features: new Collection(features), style: () => [] });
      modify.on('modifyend', (event: any) => {
        event.features.getArray().forEach((feat: any) => {
          const id = feat.get('libraryId');
          if (!id) return;
          const coords = (feat.getGeometry() as Point).getCoordinates();
          const [lon, lat] = transform(coords, map.getView().getProjection().getCode(), 'EPSG:4326');
          onEntryMove(id, lat, lon);
        });
      });
      map.addInteraction(modify);
      modifyRef.current = modify;
    }

    return () => {
      map.dispose();
      mapInstanceRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInfo, isLoading]);

  // ── Refresh layer when entries or selection change ───────────────────────
  useEffect(() => {
    refreshPictogramLayer();
  }, [entries, selectedId, refreshPictogramLayer]);

  // ── Grid toggle ───────────────────────────────────────────────────────────
  useEffect(() => {
    gridLayerRef.current?.setVisible(gridEnabled);
  }, [gridEnabled]);

  // ── Fit trigger ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (fitTrigger <= lastFitTriggerRef.current) return;
    lastFitTriggerRef.current = fitTrigger;
    fitToEntries(mapInstanceRef.current, mapInstanceRef.current.getView().getProjection());
  }, [fitTrigger]);

  // ── Keyboard: selection, cycling, coord entry ─────────────────────────────
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };

    const handleKey = (e: KeyboardEvent) => {
      if (coordEntry !== null) {
        e.preventDefault();
        if (e.key === 'Escape') { setCoordEntry(null); return; }
        if (e.key === 'Enter') {
          const inLonPhase = coordEntry.cursor === 'lonDeg' || coordEntry.cursor === 'lonMin';
          if (!inLonPhase) {
            setCoordEntry(applyKey(coordEntry, 'Enter'));
          } else {
            const coords = parseCoordEntry(coordEntry);
            if (!coords) { setCoordEntry({ ...coordEntry, hasError: true }); return; }
            if (selectedId !== null) {
              onEntryMove(selectedId, coords.lat, coords.lon);
            } else if (isPlacementMode && onEntryCreate) {
              onEntryCreate(coords.lat, coords.lon);
            }
            setCoordEntry(null);
          }
          return;
        }
        setCoordEntry(applyKey(coordEntry, e.key));
        return;
      }

      if (isInputFocused()) return;

      const key = e.key;

      if ((key === 'N' || key === 'S' || /^\d$/.test(key)) && (selectedId !== null || isPlacementMode)) {
        e.preventDefault();
        setCoordEntry(initCoordEntry(key));
        return;
      }

      if (key === '+' || key === '=') {
        e.preventDefault();
        const all = entriesRef.current;
        if (all.length === 0) return;
        const idx = all.findIndex(e => e.id === selectedIdRef.current);
        setSelectedId(all[(idx + 1) % all.length].id);
        return;
      }
      if (key === '-') {
        e.preventDefault();
        const all = entriesRef.current;
        if (all.length === 0) return;
        const idx = all.findIndex(e => e.id === selectedIdRef.current);
        setSelectedId(all[(idx - 1 + all.length) % all.length].id);
        return;
      }
      if (key === 'Escape' && selectedId !== null) {
        e.preventDefault();
        setSelectedId(null);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [coordEntry, selectedId, isPlacementMode, setCoordEntry, setSelectedId, onEntryMove, onEntryCreate]);

  // ── Fit helper ────────────────────────────────────────────────────────────
  function fitToEntries(map: OlMap, projection: any) {
    const all = entriesRef.current;
    if (all.length === 0) return;
    if (all.length === 1) {
      const [x, y] = transform([all[0].lon, all[0].lat], 'EPSG:4326', projection.getCode());
      map.getView().setCenter([x, y]);
      map.getView().setZoom(7);
      return;
    }
    const lons = all.map(e => e.lon);
    const lats = all.map(e => e.lat);
    const extent = transformExtent(
      [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)],
      'EPSG:4326',
      projection.getCode()
    );
    map.getView().fit(extent, { padding: [40, 40, 40, 40], maxZoom: 9 });
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-100">
          <span className="text-sm text-gray-500 font-aero-label">Loading map…</span>
        </div>
      )}
      <div ref={mapRef} className="w-full h-full" />
      <DisplayButton
        gridEnabled={gridEnabled}
        measureEnabled={measureEnabled}
        onGridChange={setGridEnabled}
        onMeasureChange={setMeasureEnabled}
      />
      <MapCoordinatesOverlay
        coordinate={hoverCoord}
        entryTemplate={coordEntry ? formatTemplate(coordEntry) : null}
        entryHasError={coordEntry?.hasError ?? false}
      />
    </div>
  );
};

export default LibraryMap;
