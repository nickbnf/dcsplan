import React, { useRef, useEffect, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { transform } from 'ol/proj';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Collection from 'ol/Collection';
import { createMapProjection, transformBoundsToTransverseMercator, calculateTransverseMercatorCenter } from '../utils/projectionUtils';
import { createGridLayer } from '../utils/latLonGrid';
import { createTileLayer, calculateResolutions } from '../utils/tileLayer';
import type { MapInfo } from '../utils/tileLayer';
import type { FlightPlan, LibraryObject, PictogramType } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { createFlightPlanLayer } from '../utils/flightPlanLayer';
import type { DrawingState } from '../hooks/useDrawing';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { getApiUrl, getTilesBaseUrl } from '../config/api';
import { DisplayButton } from './map/DisplayButton';
import { MapCoordinatesOverlay } from './MapCoordinatesOverlay';
import { saveMapViewState, getMapViewState, fitMapToFlightPlan } from '../utils/mapViewState';
import { useWaypointSelection } from '../contexts/WaypointSelectionContext';
import { useObjectSelection } from '../contexts/ObjectSelectionContext';
import { initCoordEntry, applyKey, parseCoordEntry, formatTemplate } from '../utils/coordEntryUtils';
import {
  buildPlanObjectsSource,
  buildThreatRingsSource,
  buildLibraryGhostsSource,
  createPlanObjectsLayer,
  createThreatRingsLayer,
  createLibraryGhostsLayer,
} from '../utils/planObjectsLayer';
import { getPictogramDef } from '../utils/pictogramCatalog';

interface MapComponentProps {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
  drawingState: DrawingState;
  onStartDragging: (map: any, waypointIndex: number, prevWpPos: [number, number] | null, nextWpPos: [number, number] | null) => void;
  onStopDragging: () => void;
  addPoint: (coordinate: [number, number]) => void;
  confirmKeyboardWaypoint: (lat: number, lon: number) => void;
  updatePreviewLine: (coordinate: [number, number]) => void;
  onMapNavInfoChange?: (info: { projection: any; navigationMode: string }) => void;
  fitToFlightPlanTrigger?: number;
  /** When provided, overrides the default waypoint commit logic for coord-entry. */
  onCoordEntryCommit?: (lat: number, lon: number) => void;
  library?: LibraryObject[];
  activeTab?: 'flightplan' | 'objects';
  isAddMarkerMode?: boolean;
  addMarkerType?: PictogramType;
  onAddLibraryRef?: (uuid: string) => void;
  onAddMarker?: (lat: number, lon: number) => void;
  onObjectTabActivate?: () => void;
  onFlightPlanTabActivate?: () => void;
}

const MapComponent: React.FC<MapComponentProps> = ({
  flightPlan,
  onFlightPlanUpdate,
  drawingState,
  onStartDragging,
  onStopDragging,
  addPoint,
  confirmKeyboardWaypoint,
  updatePreviewLine,
  onMapNavInfoChange,
  fitToFlightPlanTrigger = 0,
  onCoordEntryCommit,
  library = [],
  activeTab = 'flightplan',
  isAddMarkerMode = false,
  addMarkerType = 'sam_site',
  onAddLibraryRef,
  onAddMarker,
  onObjectTabActivate,
  onFlightPlanTabActivate,
}) => {
  const { selectedIndex, setSelectedIndex, coordEntry, setCoordEntry } = useWaypointSelection();
  const { selectedId: selectedObjectId, setSelectedId: setSelectedObjectId, coordEntry: objectCoordEntry, setCoordEntry: setObjectCoordEntry } = useObjectSelection();
  const [hoverCoord, setHoverCoord] = useState<{ raw_x: number; raw_y: number; lat: number; lon: number } | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{ text: string; pixel: [number, number] } | null>(null);
  const hoverCoordRef = useRef<{ raw_x: number; raw_y: number } | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const modifyInteractionRef = useRef<Modify | null>(null);
  const snapInteractionRef = useRef<Snap | null>(null);
  const isUpdatingFromModifyRef = useRef<boolean>(false);
  const gridLayerRef = useRef<VectorLayer | null>(null);
  const planObjectsLayerRef = useRef<VectorLayer<any> | null>(null);
  const threatRingsLayerRef = useRef<VectorLayer<any> | null>(null);
  const libGhostsLayerRef = useRef<VectorLayer<any> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapInfo, setMapInfo] = useState<MapInfo | null>(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);
  const navigationModeRef = useRef<string>("geographic");
  const lastFitTriggerRef = useRef<number>(fitToFlightPlanTrigger);

  const markerModifyRef = useRef<Modify | null>(null);
  const onFlightPlanUpdateRef = useRef(onFlightPlanUpdate);
  onFlightPlanUpdateRef.current = onFlightPlanUpdate;

  // Always-current refs so event handlers see fresh values without re-registering
  const flightPlanRef = useRef(flightPlan);
  flightPlanRef.current = flightPlan;
  const libraryRef = useRef(library);
  libraryRef.current = library;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const isAddMarkerModeRef = useRef(isAddMarkerMode);
  isAddMarkerModeRef.current = isAddMarkerMode;
  const addMarkerTypeRef = useRef(addMarkerType);
  addMarkerTypeRef.current = addMarkerType;
  const selectedObjectIdRef = useRef(selectedObjectId);
  selectedObjectIdRef.current = selectedObjectId;

  // Safe function to fetch and parse tile info JSON
  const fetchMapInfo = async (): Promise<MapInfo | null> => {
    try {
      setIsLoading(true);
      setError(null);

      const theatre = flightPlan.theatre || "syria";
      const response = await fetch(getApiUrl(`theatres/${theatre}.json`), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON');
      }

      const data = await response.json();

      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid JSON structure');
      }

      console.log('Successfully fetched map info:', data);
      return data as MapInfo;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Failed to fetch tile info:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const loadMapInfo = async () => {
      const info = await fetchMapInfo();
      setMapInfo(info);
    };
    loadMapInfo();
  }, [flightPlan.theatre]);

  // Initialize map when map info is loaded and ref is available
  useEffect(() => {
    if (!mapInfo || !mapRef.current || isLoading) {
      return;
    }

    const regionBounds = mapInfo?.bounds;
    const { projection: mapProjection } = createMapProjection(mapInfo?.projection, mapInfo?.central_meridian, mapInfo?.std_parallel1, mapInfo?.std_parallel2);
    const navigationMode = mapInfo?.navigation_mode || "geographic";
    navigationModeRef.current = navigationMode;

    if (onMapNavInfoChange) {
      onMapNavInfoChange({ projection: mapProjection, navigationMode });
    }

    const mapProjectionExtent = transformBoundsToTransverseMercator(regionBounds, mapProjection);
    (mapProjection as any).setExtent(mapProjectionExtent);
    const mapProjectionCenter = calculateTransverseMercatorCenter(regionBounds, mapProjection);
    const tileResolutions = calculateResolutions(mapInfo, mapProjection);

    const tileLayer = createTileLayer(mapInfo, mapProjection, getTilesBaseUrl(flightPlan.theatre || "syria"));
    const gridLayer = createGridLayer(regionBounds, mapProjection);
    gridLayer.set('name', 'grid');
    gridLayerRef.current = gridLayer;
    gridLayer.setVisible(gridEnabled);

    // Object layers — z-order: icons (bottom), rings, ghosts, then flightplan on top
    const refs = flightPlanRef.current.libraryRefs ?? [];
    const markers = flightPlanRef.current.markers ?? [];
    const lib = libraryRef.current;

    const planObjectsLayer = createPlanObjectsLayer(refs, markers, lib, mapProjection, selectedObjectIdRef.current);
    planObjectsLayer.set('name', 'planobjects');
    planObjectsLayerRef.current = planObjectsLayer;

    const threatRingsLayer = createThreatRingsLayer(refs, markers, lib, mapProjection);
    threatRingsLayer.set('name', 'threatrings');
    threatRingsLayerRef.current = threatRingsLayer;

    const libGhostsLayer = createLibraryGhostsLayer(lib, refs, mapProjection);
    libGhostsLayer.set('name', 'libghosts');
    libGhostsLayer.setVisible(activeTabRef.current === 'objects');
    libGhostsLayerRef.current = libGhostsLayer;

    const flightPlanLayer = createFlightPlanLayer(flightPlanRef.current, mapProjection, navigationMode);
    flightPlanLayer.set('name', 'flightplan');

    const drawingLayer = new VectorLayer({
      source: new VectorSource()
    });
    drawingLayer.set('name', 'drawing');

    const savedState = getMapViewState(flightPlan.theatre);

    mapInstanceRef.current = new Map({
      target: mapRef.current,
      pixelRatio: 1,
      layers: [
        tileLayer,
        gridLayer,
        libGhostsLayer,      // ghosts at bottom so coloured icons render on top
        planObjectsLayer,    // coloured plan objects above ghosts
        threatRingsLayer,
        flightPlanLayer,
        drawingLayer,
      ],
      view: new View({
        projection: mapProjection as any,
        center: savedState ? savedState.center : mapProjectionCenter,
        zoom: savedState ? savedState.zoom : 2,
        resolutions: tileResolutions,
        minZoom: 1,
        constrainResolution: true,
        multiWorld: false
      })
    });

    if (!savedState && fitToFlightPlanTrigger > 0 && flightPlan.points.length > 0) {
      fitMapToFlightPlan(mapInstanceRef.current, flightPlan, mapProjection);
      lastFitTriggerRef.current = fitToFlightPlanTrigger;
    }

    (window as any).mapInstance = mapInstanceRef.current;

    installInteractions(flightPlanLayer,
      drawingState,
      mapInstanceRef,
      onStartDragging,
      onStopDragging,
      onFlightPlanUpdate,
      modifyInteractionRef,
      snapInteractionRef,
      isUpdatingFromModifyRef,
      flightPlan);

    return () => {
      if (mapInstanceRef.current) {
        const view = mapInstanceRef.current.getView();
        const center = view.getCenter();
        const zoom = view.getZoom();
        if (center && zoom !== undefined) {
          saveMapViewState(center as [number, number], zoom, flightPlan.theatre);
        }

        const clickHandler = (mapInstanceRef.current as any).__clickHandler;
        if (clickHandler) {
          mapInstanceRef.current.un('click', clickHandler);
        }
        const moveHandler = (mapInstanceRef.current as any).__moveHandler;
        if (moveHandler) {
          mapInstanceRef.current.un('pointermove', moveHandler);
        }
        if (modifyInteractionRef.current) {
          mapInstanceRef.current.removeInteraction(modifyInteractionRef.current);
        }
        if (snapInteractionRef.current) {
          mapInstanceRef.current.removeInteraction(snapInteractionRef.current);
        }
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
  }, [mapInfo, isLoading]);

  // Update click handler when drawing state changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const existingHandler = (mapInstanceRef.current as any).__clickHandler;
    if (existingHandler) {
      mapInstanceRef.current.un('click', existingHandler);
    }

    const clickHandler = (event: any) => {
      const coordinate = event.coordinate;
      if (!coordinate) return;

      // 1. Add Marker placement mode — takes priority over all other click interactions
      if (isAddMarkerModeRef.current) {
        const [lon, lat] = transform(coordinate, mapInstanceRef.current!.getView().getProjection().getCode(), 'EPSG:4326');
        onAddMarker?.(lat, lon);
        return;
      }

      // 2. Check coloured plan object features
      let hitObjectId: string | null = null;
      mapInstanceRef.current?.forEachFeatureAtPixel(event.pixel, (feature: any) => {
        hitObjectId = feature.get('objectId') ?? null;
        return true;
      }, { layerFilter: (l: any) => l.get('name') === 'planobjects', hitTolerance: 8 });

      if (hitObjectId !== null) {
        setSelectedObjectId(selectedObjectIdRef.current === hitObjectId ? null : hitObjectId);
        onObjectTabActivate?.();
        return;
      }

      // 3. Check library ghost features (only when Objects tab is active)
      if (activeTabRef.current === 'objects') {
        let hitGhostId: string | null = null;
        mapInstanceRef.current?.forEachFeatureAtPixel(event.pixel, (feature: any) => {
          hitGhostId = feature.get('ghostId') ?? null;
          return true;
        }, { layerFilter: (l: any) => l.get('name') === 'libghosts', hitTolerance: 8 });

        if (hitGhostId !== null) {
          onAddLibraryRef?.(hitGhostId);
          return;
        }
      }

      // 4. Waypoint hit-test
      let hitWaypointIndex: number | null = null;
      mapInstanceRef.current?.forEachFeatureAtPixel(event.pixel, (feature: any) => {
        if (feature.get('type') === 'turnpoint') {
          hitWaypointIndex = feature.get('waypointIndex');
          return true;
        }
      }, { hitTolerance: 8 });

      if (hitWaypointIndex !== null) {
        setSelectedIndex(hitWaypointIndex);
        onFlightPlanTabActivate?.();
        return;
      }

      // 5. Drawing mode — add new waypoint
      if (drawingState.isDrawing === 'NEW_POINT') {
        addPoint(coordinate);
      } else {
        // Empty map click → deselect
        setSelectedIndex(null);
      }
    };

    mapInstanceRef.current.on('click', clickHandler);
    (mapInstanceRef.current as any).__clickHandler = clickHandler;
  }, [drawingState.isDrawing === 'NEW_POINT', addPoint, flightPlan, onFlightPlanUpdate, setSelectedIndex, setSelectedObjectId, onAddLibraryRef, onAddMarker, onObjectTabActivate, onFlightPlanTabActivate]);

  // Set up mouse move handler for coordinate display and hover tooltip
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const existingMoveHandler = (mapInstanceRef.current as any).__moveHandler;
    if (existingMoveHandler) {
      mapInstanceRef.current.un('pointermove', existingMoveHandler);
    }

    const moveHandler = (event: any) => {
      const coordinate = event.coordinate;
      if (!coordinate) return;

      const geographicCoordinate = transform(coordinate, mapInstanceRef.current!.getView().getProjection().getCode(), 'EPSG:4326');
      hoverCoordRef.current = { raw_x: coordinate[0], raw_y: coordinate[1] };
      setHoverCoord({
        raw_x: coordinate[0],
        raw_y: coordinate[1],
        lon: geographicCoordinate[0],
        lat: geographicCoordinate[1]
      });

      if (drawingState.isDrawing !== 'NO_DRAWING') {
        updatePreviewLine(coordinate);
      }

      // Hover tooltip for plan objects and library ghosts
      let tooltipText: string | null = null;

      mapInstanceRef.current?.forEachFeatureAtPixel(event.pixel, (feature: any) => {
        const objectId = feature.get('objectId') as string | undefined;
        if (objectId) {
          const fp = flightPlanRef.current;
          const lib = libraryRef.current;
          const ref_ = (fp.libraryRefs ?? []).find(r => r.uuid === objectId);
          if (ref_) {
            const entry = lib.find(e => e.id === objectId);
            if (entry) {
              const effectiveComment = ref_.comment || entry.defaultComment;
              let text = entry.name || 'Unnamed';
              if (effectiveComment) text += `\n${effectiveComment}`;
              if (entry.range) text += `\nRange: ${entry.range} NM`;
              tooltipText = text;
              return true;
            }
          }
          const marker = (fp.markers ?? []).find(m => m.id === objectId);
          if (marker) {
            let text = marker.name || getPictogramDef(marker.type).label;
            if (marker.comment) text += `\n${marker.comment}`;
            if (marker.range) text += `\nRange: ${marker.range} NM`;
            tooltipText = text;
            return true;
          }
        }
        const ghostId = feature.get('ghostId') as string | undefined;
        if (ghostId) {
          tooltipText = (feature.get('ghostName') as string) || 'Library entry';
          return true;
        }
      }, { hitTolerance: 8 });

      setHoverTooltip(tooltipText !== null ? { text: tooltipText, pixel: [event.pixel[0], event.pixel[1]] } : null);

      // Cursor style
      const target = mapInstanceRef.current?.getTargetElement() as HTMLElement | undefined;
      if (!target) return;
      const hitFeature = mapInstanceRef.current?.forEachFeatureAtPixel(event.pixel, (f: any) => f, { hitTolerance: 8 });
      if (hitFeature?.get('objectId') || hitFeature?.get('ghostId')) {
        target.style.cursor = 'pointer';
      } else if (isAddMarkerModeRef.current && activeTabRef.current === 'objects') {
        target.style.cursor = 'crosshair';
      } else {
        target.style.cursor = '';
      }
    };

    mapInstanceRef.current.on('pointermove', moveHandler);
    (mapInstanceRef.current as any).__moveHandler = moveHandler;
  }, [drawingState.isDrawing, updatePreviewLine, mapInfo]);

  // Manage Modify and Snap interactions based on drawing state
  useEffect(() => {
    if (!mapInstanceRef.current) {
      console.log('Interaction management: map not ready');
      return;
    }

    if (!modifyInteractionRef.current || !snapInteractionRef.current) {
      console.log('Interaction management: interactions not ready yet');
      return;
    }

    if (drawingState.isDrawing === 'NEW_POINT') {
      console.log('Removing Modify/Snap interactions (drawing mode)');
      mapInstanceRef.current.removeInteraction(modifyInteractionRef.current);
      mapInstanceRef.current.removeInteraction(snapInteractionRef.current);
    } else if (drawingState.isDrawing === 'NO_DRAWING') {
      console.log('Adding Modify/Snap interactions (normal mode)');
      const interactions = mapInstanceRef.current.getInteractions().getArray();
      if (!interactions.includes(modifyInteractionRef.current)) {
        mapInstanceRef.current.addInteraction(modifyInteractionRef.current);
      }
      if (!interactions.includes(snapInteractionRef.current)) {
        mapInstanceRef.current.addInteraction(snapInteractionRef.current);
      }
    }
  }, [drawingState.isDrawing]);

  // Handle adding points to flight plan during drawing
  useEffect(() => {
    console.log('Drawing state changed:', drawingState);
    if (drawingState.isDrawing === 'NEW_POINT' && drawingState.currentPoint) {
      const latestPoint = drawingState.currentPoint;

      const pointExists = flightPlan.points.some(p =>
        Math.abs(p.lat - latestPoint.getCoordinates()[1]) < 0.0001 && Math.abs(p.lon - latestPoint.getCoordinates()[0]) < 0.0001
      );

      if (!pointExists) {
        let updatedPlan = flightPlanUtils.addTurnPoint(flightPlan, latestPoint.getCoordinates()[1], latestPoint.getCoordinates()[0]);
        console.log('Updated flightplan:', updatedPlan.points.length, 'points');
        onFlightPlanUpdate(updatedPlan);
      }
    }
  }, [drawingState.currentPoint, drawingState.isDrawing]);

  // Update flight plan layer when flight plan changes
  useEffect(() => {
    console.log('Flight plan changed:', flightPlan);
    if (!mapInstanceRef.current) return;

    const layers = mapInstanceRef.current.getLayers().getArray();
    const existingFlightPlanLayer = layers.find((layer: any) =>
      layer.get('name') === 'flightplan'
    );

    if (existingFlightPlanLayer) {
      mapInstanceRef.current.removeLayer(existingFlightPlanLayer);
    }

    const newFlightPlanLayer = createFlightPlanLayer(flightPlan, mapInstanceRef.current.getView().getProjection(), navigationModeRef.current, drawingState.draggedWaypointIndex ?? undefined, selectedIndex ?? undefined);
    newFlightPlanLayer.set('name', 'flightplan');

    mapInstanceRef.current.addLayer(newFlightPlanLayer);

    if (drawingState.isDrawing !== 'DRAG_POINT') {
      installInteractions(newFlightPlanLayer,
        drawingState,
        mapInstanceRef,
        onStartDragging,
        onStopDragging,
        onFlightPlanUpdate,
        modifyInteractionRef,
        snapInteractionRef,
        isUpdatingFromModifyRef,
        flightPlan);
    }
    else {
      console.log('Removing interactions (dragging mode)');
      if (snapInteractionRef.current) {
        mapInstanceRef.current.removeInteraction(snapInteractionRef.current);
      }
    }
  }, [flightPlan, isLoading, drawingState.isDrawing === 'DRAG_POINT', selectedIndex]);

  // Ensure interactions are properly installed when transitioning from drawing to normal mode
  useEffect(() => {
    if (!mapInstanceRef.current || drawingState.isDrawing !== 'NO_DRAWING') {
      return;
    }

    if (!modifyInteractionRef.current || !snapInteractionRef.current) {
      console.log('Reinstalling interactions after drawing mode');
      const layers = mapInstanceRef.current.getLayers().getArray();
      const flightPlanLayer = layers.find((layer: any) =>
        layer.get('name') === 'flightplan'
      );

      if (flightPlanLayer && flightPlanLayer instanceof VectorLayer) {
        installInteractions(flightPlanLayer,
          drawingState,
          mapInstanceRef,
          onStartDragging,
          onStopDragging,
          onFlightPlanUpdate,
          modifyInteractionRef,
          snapInteractionRef,
          isUpdatingFromModifyRef,
          flightPlan);
      }
    }
  }, [drawingState.isDrawing]);

  // Refresh plan objects and threat rings when plan data, library, or selection changes
  useEffect(() => {
    if (!mapInstanceRef.current || !planObjectsLayerRef.current || !threatRingsLayerRef.current) return;
    const proj = mapInstanceRef.current.getView().getProjection();
    const refs = flightPlan.libraryRefs ?? [];
    const markers = flightPlan.markers ?? [];
    const newSource = buildPlanObjectsSource(refs, markers, library, proj, selectedObjectId);
    planObjectsLayerRef.current.setSource(newSource);
    threatRingsLayerRef.current.setSource(buildThreatRingsSource(refs, markers, library, proj));

    // Rebuild marker Modify interaction so dragging plan markers moves them
    if (markerModifyRef.current) {
      mapInstanceRef.current.removeInteraction(markerModifyRef.current);
      markerModifyRef.current = null;
    }
    const markerFeatures = newSource.getFeatures().filter((f: any) => f.get('objectKind') === 'marker');
    if (markerFeatures.length > 0) {
      const markerModify = new Modify({ features: new Collection(markerFeatures), style: () => [] });
      markerModify.on('modifyend', (event: any) => {
        event.features.getArray().forEach((feat: any) => {
          if (feat.get('objectKind') !== 'marker') return;
          const id = feat.get('objectId') as string;
          const coords = (feat.getGeometry() as any).getCoordinates();
          const [lon, lat] = transform(coords, mapInstanceRef.current!.getView().getProjection().getCode(), 'EPSG:4326');
          const fp = flightPlanRef.current;
          onFlightPlanUpdateRef.current({
            ...fp,
            markers: (fp.markers ?? []).map(m => m.id === id ? { ...m, lat, lon } : m),
          });
        });
      });
      mapInstanceRef.current.addInteraction(markerModify);
      markerModifyRef.current = markerModify;
    }
  }, [flightPlan.libraryRefs, flightPlan.markers, library, selectedObjectId]);

  // Refresh library ghost layer when library, refs, or tab changes
  useEffect(() => {
    if (!mapInstanceRef.current || !libGhostsLayerRef.current) return;
    const proj = mapInstanceRef.current.getView().getProjection();
    const refs = flightPlan.libraryRefs ?? [];
    libGhostsLayerRef.current.setSource(buildLibraryGhostsSource(library, refs, proj));
    libGhostsLayerRef.current.setVisible(activeTab === 'objects');
  }, [library, flightPlan.libraryRefs, activeTab]);

  // Global keydown handler: selection cycling, Escape, coord entry mode
  useEffect(() => {
    const isInputFocused = () => {
      const el = document.activeElement;
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // --- Object coord entry active (for selected marker) ---
      if (objectCoordEntry !== null && selectedObjectId !== null) {
        e.preventDefault();
        if (e.key === 'Escape') { setObjectCoordEntry(null); return; }
        if (e.key === 'Enter') {
          const inLonPhase = objectCoordEntry.cursor === 'lonDeg' || objectCoordEntry.cursor === 'lonMin';
          if (!inLonPhase) {
            setObjectCoordEntry(applyKey(objectCoordEntry, 'Enter'));
          } else {
            const coords = parseCoordEntry(objectCoordEntry);
            if (!coords) { setObjectCoordEntry({ ...objectCoordEntry, hasError: true }); return; }
            // Move the selected marker
            const selectedId = selectedObjectIdRef.current;
            if (selectedId) {
              const fp = flightPlanRef.current;
              const markers = fp.markers ?? [];
              const idx = markers.findIndex(m => m.id === selectedId);
              if (idx >= 0) {
                const updated = { ...fp, markers: markers.map((m, i) => i === idx ? { ...m, lat: coords.lat, lon: coords.lon } : m) };
                onFlightPlanUpdate(updated);
              }
            }
            setObjectCoordEntry(null);
          }
          return;
        }
        setObjectCoordEntry(applyKey(objectCoordEntry, e.key));
        return;
      }

      // --- Waypoint coord entry mode active ---
      if (coordEntry !== null) {
        e.preventDefault();

        if (e.key === 'Escape') {
          setCoordEntry(null);
          return;
        }

        if (e.key === 'Enter') {
          const inLonPhase = coordEntry.cursor === 'lonDeg' || coordEntry.cursor === 'lonMin';
          if (!inLonPhase) {
            const next = applyKey(coordEntry, 'Enter');
            setCoordEntry(next);
          } else {
            const coords = parseCoordEntry(coordEntry);
            if (!coords) { setCoordEntry({ ...coordEntry, hasError: true }); return; }

            if (onCoordEntryCommit) {
              onCoordEntryCommit(coords.lat, coords.lon);
              setCoordEntry(null);
            } else if (selectedIndex !== null) {
              const updated = flightPlanUtils.moveTurnPoint(flightPlan, selectedIndex, coords.lat, coords.lon);
              onFlightPlanUpdate(updated);
              setCoordEntry(null);
            } else if (drawingState.isDrawing === 'NEW_POINT') {
              const updated = flightPlanUtils.addTurnPoint(flightPlan, coords.lat, coords.lon);
              onFlightPlanUpdate(updated);
              confirmKeyboardWaypoint(coords.lat, coords.lon);
              if (hoverCoordRef.current) {
                updatePreviewLine([hoverCoordRef.current.raw_x, hoverCoordRef.current.raw_y]);
              }
              setCoordEntry(null);
            } else if (isAddMarkerModeRef.current) {
              onAddMarker?.(coords.lat, coords.lon);
              setCoordEntry(null);
            }
          }
          return;
        }

        const next = applyKey(coordEntry, e.key);
        setCoordEntry(next);
        return;
      }

      // --- No active coord entry ---
      if (isInputFocused()) return;

      const key = e.key;

      // Coord entry for selected marker (N/S/digit when a marker is selected)
      if ((key === 'N' || key === 'S' || /^\d$/.test(key)) && selectedObjectId !== null) {
        const fp = flightPlanRef.current;
        const isMarker = (fp.markers ?? []).some(m => m.id === selectedObjectId);
        if (isMarker) {
          e.preventDefault();
          setObjectCoordEntry(initCoordEntry(key));
          return;
        }
      }

      // Coord entry for waypoint (N/S/digit when waypoint selected or drawing) or Add Marker mode
      if ((key === 'N' || key === 'S' || /^\d$/.test(key)) &&
          (selectedIndex !== null || drawingState.isDrawing === 'NEW_POINT' ||
           (isAddMarkerModeRef.current && activeTabRef.current === 'objects'))) {
        e.preventDefault();
        setCoordEntry(initCoordEntry(key));
        return;
      }

      // Selection cycling for waypoints
      if (key === '+' || key === '=') {
        e.preventDefault();
        const count = flightPlan.points.length;
        if (count === 0) return;
        setSelectedIndex(selectedIndex === null ? 0 : (selectedIndex + 1) % count);
        return;
      }
      if (key === '-') {
        e.preventDefault();
        const count = flightPlan.points.length;
        if (count === 0) return;
        setSelectedIndex(selectedIndex === null ? 0 : (selectedIndex - 1 + count) % count);
        return;
      }

      // Escape deselects
      if (key === 'Escape') {
        if (selectedIndex !== null) { e.preventDefault(); setSelectedIndex(null); }
        if (selectedObjectId !== null) { e.preventDefault(); setSelectedObjectId(null); }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [objectCoordEntry, coordEntry, selectedIndex, selectedObjectId, flightPlan, drawingState.isDrawing, setCoordEntry, setObjectCoordEntry, setSelectedIndex, setSelectedObjectId, onFlightPlanUpdate, onCoordEntryCommit]);

  // Cancel coord entry when drag ends
  useEffect(() => {
    if (drawingState.isDrawing === 'NO_DRAWING' && coordEntry !== null) {
      setCoordEntry(null);
    }
  }, [drawingState.isDrawing]);

  useEffect(() => {
    if (gridLayerRef.current) {
      gridLayerRef.current.setVisible(gridEnabled);
    }
  }, [gridEnabled]);

  useEffect(() => {
    if (!mapInstanceRef.current) return;
    if (fitToFlightPlanTrigger <= lastFitTriggerRef.current) return;
    lastFitTriggerRef.current = fitToFlightPlanTrigger;
    fitMapToFlightPlan(mapInstanceRef.current, flightPlan, mapInstanceRef.current.getView().getProjection());
  }, [fitToFlightPlanTrigger]);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-avio-primary mx-auto mb-2"></div>
          <p className="text-gray-600">Loading map configuration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-red-50">
        <div className="text-center max-w-md mx-auto p-4">
          <div className="text-red-600 text-2xl mb-2">⚠️</div>
          <h3 className="text-red-800 font-semibold mb-2">Failed to load map configuration</h3>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const activeCoordEntry = objectCoordEntry ?? coordEntry;

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
      <DisplayButton
        gridEnabled={gridEnabled}
        measureEnabled={measureEnabled}
        onGridChange={setGridEnabled}
        onMeasureChange={setMeasureEnabled}
      />
      <MapCoordinatesOverlay
        coordinate={hoverCoord}
        entryTemplate={activeCoordEntry ? formatTemplate(activeCoordEntry) : null}
        entryHasError={activeCoordEntry?.hasError ?? false}
      />
      {hoverTooltip && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-900 bg-opacity-80 text-white text-xs font-aero-label rounded px-2 py-1 whitespace-pre-line max-w-[200px]"
          style={{ left: hoverTooltip.pixel[0] + 12, top: hoverTooltip.pixel[1] - 8 }}
        >
          {hoverTooltip.text}
        </div>
      )}
    </div>
  );
};

const installInteractions = (flightPlanLayer: VectorLayer<any>,
  drawingState: DrawingState,
  mapInstanceRef: React.RefObject<Map | null>,
  onStartDragging: (map: any, waypointIndex: number, prevWpPos: [number, number] | null, nextWpPos: [number, number] | null) => void,
  onStopDragging: () => void,
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void,
  modifyInteractionRef: React.RefObject<Modify | null>,
  snapInteractionRef: React.RefObject<Snap | null>,
  isUpdatingFromModifyRef: React.RefObject<boolean>,
  flightPlan: FlightPlan) => {
  const source = flightPlanLayer.getSource();
  if (source) {
    if (modifyInteractionRef.current) {
      mapInstanceRef.current?.removeInteraction(modifyInteractionRef.current);
    }
    if (snapInteractionRef.current) {
      mapInstanceRef.current?.removeInteraction(snapInteractionRef.current);
    }

    const waypointFeatures = source.getFeatures().filter((feature: any) =>
      feature.get('type') === 'turnpoint'
    );

    const modifyInteraction = new Modify({
      features: new Collection(waypointFeatures),
      style: () => [],
    });

    const snapInteraction = new Snap({
      features: new Collection(waypointFeatures)
    });

    modifyInteractionRef.current = modifyInteraction;
    snapInteractionRef.current = snapInteraction;

    if (drawingState.isDrawing === 'NO_DRAWING' && mapInstanceRef.current) {
      const interactions = mapInstanceRef.current.getInteractions().getArray();
      if (!interactions.includes(modifyInteraction)) {
        mapInstanceRef.current.addInteraction(modifyInteraction);
      }
      if (!interactions.includes(snapInteraction)) {
        mapInstanceRef.current.addInteraction(snapInteraction);
      }
    }

    if (modifyInteractionRef.current) {
      console.log('Setting up event handlers for Modify interaction');
      modifyInteractionRef.current.un('modifystart', () => { });
      modifyInteractionRef.current.un('modifyend', () => { });

      modifyInteractionRef.current.on('modifystart', (event: any) => {
        console.log('Modify start event triggered', event);
        const features = event.features.getArray();
        features.forEach((feature: any) => {
          if (feature.get('type') === 'turnpoint') {
            const waypointIndex = feature.get('waypointIndex');
            console.log('Starting to drag waypoint', waypointIndex);
            const prevWpPos = flightPlanUtils.prevWptPosition(flightPlan, waypointIndex)
            const nextWpPos = flightPlanUtils.nextWptPosition(flightPlan, waypointIndex)
            onStartDragging(mapInstanceRef.current!, waypointIndex, prevWpPos, nextWpPos);
          }
        });
      });
    }

    if (modifyInteractionRef.current) {
      modifyInteractionRef.current.on('modifyend', (event: any) => {
        console.log('Modify end event triggered', event);
        const features = event.features.getArray();
        console.log('Modified features:', features.length);
        features.forEach((feature: any) => {
          if (feature.get('type') === 'turnpoint') {
            const coordinates = feature.getGeometry().getCoordinates();
            const [lon, lat] = transform(coordinates, mapInstanceRef.current!.getView().getProjection().getCode(), 'EPSG:4326');

            const waypointIndex = feature.get('waypointIndex');
            console.log('Moving waypoint', waypointIndex, 'to', lat, lon);

            if (waypointIndex !== undefined && waypointIndex >= 0) {
              onStopDragging();
              isUpdatingFromModifyRef.current = true;
              const updatedFlightPlan = flightPlanUtils.moveTurnPoint(flightPlan, waypointIndex, lat, lon);
              console.log('Updating flight plan with', updatedFlightPlan.points.length, 'points');
              onFlightPlanUpdate(updatedFlightPlan);
              setTimeout(() => {
                isUpdatingFromModifyRef.current = false;
              }, 50);
            }
          }
        });
      });
    }
  }
}

export default MapComponent;
