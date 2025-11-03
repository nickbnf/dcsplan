import React, { useRef, useEffect, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { transform } from 'ol/proj';
import Modify from 'ol/interaction/Modify';
import Snap from 'ol/interaction/Snap';
import Collection from 'ol/Collection';
import { createTransverseMercatorProjection, transformBoundsToTransverseMercator, calculateTransverseMercatorCenter } from '../utils/projectionUtils';
import { createGridLayer } from '../utils/latLonGrid';
import { createTileLayer, type TileInfo } from '../utils/tileLayer';
import type { FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { createFlightPlanLayer } from '../utils/flightPlanLayer';
import type { DrawingState } from '../hooks/useDrawing';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { getApiUrl, getTilesBaseUrl } from '../config/api';

interface MapComponentProps {
  onCoordinateChange?: (coord: { raw_x: number; raw_y: number; lat: number; lon: number } | null) => void;
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
  drawingState: DrawingState;
  onStartDragging: (map: any, waypointIndex: number, prevWpPos: [number, number] | null, nextWpPos: [number, number] | null) => void;
  onStopDragging: () => void;
  addPoint: (coordinate: [number, number]) => void;
  updatePreviewLine: (coordinate: [number, number]) => void;
}

const MapComponent: React.FC<MapComponentProps> = ({ 
  onCoordinateChange, 
  flightPlan, 
  onFlightPlanUpdate, 
  drawingState, 
  onStartDragging,
  onStopDragging,
  addPoint, 
  updatePreviewLine, 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const modifyInteractionRef = useRef<Modify | null>(null);
  const snapInteractionRef = useRef<Snap | null>(null);
  const isUpdatingFromModifyRef = useRef<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tileInfo, setTileInfo] = useState<TileInfo | null>(null);

  // Safe function to fetch and parse tile info JSON
  const fetchTileInfo = async (): Promise<TileInfo | null> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(getApiUrl('tiles/tiles_info.json'), {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON');
      }

      const data = await response.json();
      
      // Validate the structure (basic validation)
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid JSON structure');
      }

      console.log('Successfully fetched tile info:', data);
      return data as TileInfo;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      console.error('Failed to fetch tile info:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch tile info on component mount
  useEffect(() => {
    const loadTileInfo = async () => {
      const info = await fetchTileInfo();
      setTileInfo(info);
    };
    loadTileInfo();
  }, []);

  // Initialize map when tile info is loaded and ref is available
  useEffect(() => {
    if (!tileInfo || !mapRef.current || isLoading) {
      return;
    }

    console.log('Map initialization starting, mapRef.current:', mapRef.current);
    
    // Use fetched bounds or fallback to default bounds
    const regionBounds = tileInfo?.bounds || {
      minLon: 29.9266,   // Western boundary
      minLat: 31.3642,   // Southern boundary
      maxLon: 41.695,  // Eastern boundary (South-East point) 
      // maxLon: 41.4985, // Eastern boundary (North-East point)
      maxLat: 37.8254    // Northern boundary
    };

    console.log("Using bounds:", regionBounds);

    // Create transverse Mercator projection with 39° central meridian
    console.log("Using transverse Mercator projection with 39° central meridian");
    
    const { projection: transverseMercatorProjection } = createTransverseMercatorProjection();
    
    // Transform geographic bounds to transverse Mercator coordinates
    const transverseMercatorExtent = transformBoundsToTransverseMercator(regionBounds, transverseMercatorProjection);
    console.log("Transverse Mercator extent (meters):", transverseMercatorExtent);
    
    // Set the projection extent
    transverseMercatorProjection.setExtent(transverseMercatorExtent);

    // Calculate center in transverse Mercator coordinates
    const transverseMercatorCenter = calculateTransverseMercatorCenter(regionBounds, transverseMercatorProjection);

    // Create tile layer and grid layer
    const tileLayer = createTileLayer(tileInfo, regionBounds, transverseMercatorProjection, getTilesBaseUrl());
    const gridLayer = createGridLayer(regionBounds, transverseMercatorProjection);
    const flightPlanLayer = createFlightPlanLayer(flightPlan, transverseMercatorProjection);
    flightPlanLayer.set('name', 'flightplan');
    
    console.log('Created initial flight plan layer with', flightPlan.points.length, 'points');
    
    // Create drawing layer
    const drawingLayer = new VectorLayer({
      source: new VectorSource()
    });
    drawingLayer.set('name', 'drawing');

    mapInstanceRef.current = new Map({
      target: mapRef.current,
      layers: [
        tileLayer,
        gridLayer,
        flightPlanLayer,
        drawingLayer
      ],
      view: new View({
        projection: transverseMercatorProjection,
        center: transverseMercatorCenter,
        zoom: 2,
        maxZoom: (tileInfo?.zoom_info?.length || 1) - 1,
        minZoom: 1,
        // extent: transverseMercatorExtent, // Constraint the view to the map only
        constrainResolution: true,  // Snap to zoom levels
        multiWorld: false
      })
    });

    // Expose map instance to window for access from sidebar
    (window as any).mapInstance = mapInstanceRef.current;

    // Initialize interactions immediately after map creation
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

    console.log("Flight plan:", flightPlan);

    return () => {
      if (mapInstanceRef.current) {
        // Remove click handler if it exists
        const clickHandler = (mapInstanceRef.current as any).__clickHandler;
        if (clickHandler) {
          mapInstanceRef.current.un('click', clickHandler);
        }
        // Remove move handler if it exists
        const moveHandler = (mapInstanceRef.current as any).__moveHandler;
        if (moveHandler) {
          mapInstanceRef.current.un('pointermove', moveHandler);
        }
        // Remove interactions if they exist
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
  }, [tileInfo, isLoading]); // This effect runs when tileInfo or isLoading changes

  // Update click handler when drawing state changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Remove existing click handler
    const existingHandler = (mapInstanceRef.current as any).__clickHandler;
    if (existingHandler) {
      mapInstanceRef.current.un('click', existingHandler);
    }

    // Add new click handler
    const clickHandler = (event: any) => {
      const coordinate = event.coordinate;
      if (!coordinate) return;

      if (drawingState.isDrawing === 'NEW_POINT') {
        // In drawing mode, add points to the current drawing
        console.log('Adding point to current drawing', coordinate);
        addPoint(coordinate);
      }
    };
    
    mapInstanceRef.current.on('click', clickHandler);
    (mapInstanceRef.current as any).__clickHandler = clickHandler;
  }, [drawingState.isDrawing === 'NEW_POINT', addPoint, flightPlan, onFlightPlanUpdate]);

  // Set up mouse move handler for coordinate display
  useEffect(() => {
    if (!mapInstanceRef.current || !onCoordinateChange) return;

    // Remove existing mouse move handler
    const existingMoveHandler = (mapInstanceRef.current as any).__moveHandler;
    if (existingMoveHandler) {
      mapInstanceRef.current.un('pointermove', existingMoveHandler);
    }

    // Add new mouse move handler
    const moveHandler = (event: any) => {
      const coordinate = event.coordinate;
      if (!coordinate) return;

      // Update coordinate display
      const geographicCoordinate = transform(coordinate, mapInstanceRef.current!.getView().getProjection().getCode(), 'EPSG:4326');
      onCoordinateChange({
        raw_x: coordinate[0],
        raw_y: coordinate[1],
        lon: geographicCoordinate[0],
        lat: geographicCoordinate[1]
      });

      // Update preview line if in drawing mode
      if (drawingState.isDrawing !== 'NO_DRAWING') {
        console.log('Updating preview line');
        updatePreviewLine(coordinate);
      }
    };
    
    mapInstanceRef.current.on('pointermove', moveHandler);
    (mapInstanceRef.current as any).__moveHandler = moveHandler;
  }, [onCoordinateChange, drawingState.isDrawing, updatePreviewLine, tileInfo]);

  // Manage Modify and Snap interactions based on drawing state
  useEffect(() => {
    if (!mapInstanceRef.current) {
      console.log('Interaction management: map not ready');
      return;
    }

    // Only proceed if interactions exist
    if (!modifyInteractionRef.current || !snapInteractionRef.current) {
      console.log('Interaction management: interactions not ready yet');
      return;
    }

    if (drawingState.isDrawing === 'NEW_POINT') {
      // Remove interactions when drawing
      console.log('Removing Modify/Snap interactions (drawing mode)');
      mapInstanceRef.current.removeInteraction(modifyInteractionRef.current);
      mapInstanceRef.current.removeInteraction(snapInteractionRef.current);
    } else if (drawingState.isDrawing === 'NO_DRAWING') {
      // Add interactions when not drawing (only if not already added)
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
    // Add points to flight plan as they're drawn (when currentPoints changes)
    if (drawingState.isDrawing === 'NEW_POINT' && drawingState.currentPoint) {
      const latestPoint = drawingState.currentPoint;
      
      console.log('Adding to flightplan, latest point:', latestPoint.getCoordinates());

      // Only add if this point isn't already in the flight plan
      const pointExists = flightPlan.points.some(p => 
        Math.abs(p.lat - latestPoint.getCoordinates()[1]) < 0.0001 && Math.abs(p.lon - latestPoint.getCoordinates()[0]) < 0.0001
      );
      
      if (!pointExists) {
        let updatedPlan = flightPlanUtils.addTurnPoint(flightPlan, latestPoint.getCoordinates()[1], latestPoint.getCoordinates()[0]);
        console.log('Updated flightplan:', updatedPlan.points.length, 'points');

        /*
        // Add line to previous point if there are at least 2 points in current drawing
        if (drawingState.currentPoints.length > 1) {
          const previousPoint = drawingState.currentPoints[drawingState.currentPoints.length - 2];
          updatedPlan = flightPlanUtils.addLine(updatedPlan, previousPoint, latestPoint);
        }
        */
        
        onFlightPlanUpdate(updatedPlan);
      }
    }
  }, [drawingState.currentPoint, drawingState.isDrawing]);

  // Update flight plan layer when flight plan changes
  useEffect(() => {
    console.log('Flight plan changed:', flightPlan);
    if (!mapInstanceRef.current) return;

    // Find and remove the existing flight plan layer
    const layers = mapInstanceRef.current.getLayers().getArray();
    const existingFlightPlanLayer = layers.find((layer: any) => 
      layer.get('name') === 'flightplan'
    );

    if (existingFlightPlanLayer) {
      mapInstanceRef.current.removeLayer(existingFlightPlanLayer);
    }

    // Create a new flight plan layer with current data
    const newFlightPlanLayer = createFlightPlanLayer(flightPlan, mapInstanceRef.current.getView().getProjection(), drawingState.draggedWaypointIndex ?? undefined);
    newFlightPlanLayer.set('name', 'flightplan');
    
    // Add the new layer to the map
    mapInstanceRef.current.addLayer(newFlightPlanLayer);

    // Install the right interactions
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
  }, [flightPlan, isLoading, drawingState.isDrawing === 'DRAG_POINT']);

  // Ensure interactions are properly installed when transitioning from drawing to normal mode
  useEffect(() => {
    if (!mapInstanceRef.current || drawingState.isDrawing !== 'NO_DRAWING') {
      return;
    }

    // If we're in normal mode but interactions don't exist, reinstall them
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

  // Show loading state
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

  // Show error state
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

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
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
    // Remove interactions if they exist
    if (modifyInteractionRef.current) {
      mapInstanceRef.current?.removeInteraction(modifyInteractionRef.current);
    }
    if (snapInteractionRef.current) {
      mapInstanceRef.current?.removeInteraction(snapInteractionRef.current);
    }

    // Create Modify interaction for editing waypoints only
    const waypointFeatures = source.getFeatures().filter((feature: any) =>
      feature.get('type') === 'turnpoint'
    );
    console.log('Creating Modify interaction with', waypointFeatures.length, 'waypoint features');

    const modifyInteraction = new Modify({
      features: new Collection(waypointFeatures)
    });

    // Create Snap interaction for snapping to waypoints
    const snapInteraction = new Snap({
      features: new Collection(waypointFeatures)
    });

    // Store references
    modifyInteractionRef.current = modifyInteraction;
    snapInteractionRef.current = snapInteraction;

    // Add interactions to map (only when not drawing and not already added)
    if (drawingState.isDrawing === 'NO_DRAWING' && mapInstanceRef.current) {
      const interactions = mapInstanceRef.current.getInteractions().getArray();
      if (!interactions.includes(modifyInteraction)) {
        mapInstanceRef.current.addInteraction(modifyInteraction);
      }
      if (!interactions.includes(snapInteraction)) {
        mapInstanceRef.current.addInteraction(snapInteraction);
      }
    }

    // Handle modify start event to hide lines around dragged waypoint
    if (modifyInteractionRef.current) {
      console.log('Setting up event handlers for Modify interaction');
      // Remove existing event listeners to avoid duplicates
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

    // Handle modify events to update flight plan
    if (modifyInteractionRef.current) {
      modifyInteractionRef.current.on('modifyend', (event: any) => {
        console.log('Modify end event triggered', event);
        const features = event.features.getArray();
        console.log('Modified features:', features.length);
        features.forEach((feature: any) => {
          if (feature.get('type') === 'turnpoint') {
            const coordinates = feature.getGeometry().getCoordinates();
            const [lon, lat] = transform(coordinates, mapInstanceRef.current!.getView().getProjection().getCode(), 'EPSG:4326');

            // Get the waypoint index directly from the feature
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

        // Clear the dragged waypoint index to restore all lines
        console.log('Drag ended, restoring all flight lines');
      });
    }
  }
}

export default MapComponent;
