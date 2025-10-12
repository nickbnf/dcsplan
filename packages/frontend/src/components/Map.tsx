import React, { useRef, useEffect, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { transform } from 'ol/proj';
import { createTransverseMercatorProjection, transformBoundsToTransverseMercator, calculateTransverseMercatorCenter } from '../utils/projectionUtils';
import { createGridLayer } from '../utils/latLonGrid';
import { createTileLayer, type TileInfo } from '../utils/tileLayer';
import type { FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { createFlightPlanLayer } from '../utils/flightPlanLayer';
import { useDrawing } from '../hooks/useDrawing';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';

interface MapComponentProps {
  onCoordinateChange?: (coord: { raw_x: number; raw_y: number; lat: number; lon: number } | null) => void;
}

const MapComponent: React.FC<MapComponentProps> = ({ onCoordinateChange }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tileInfo, setTileInfo] = useState<TileInfo | null>(null);

  const [flightPlan, setFlightPlan] = useState<FlightPlan>(flightPlanUtils.newFlightPlan());
  
  // Debug flight plan state changes
  useEffect(() => {
    console.log('🔄 FLIGHT PLAN STATE CHANGED:', flightPlan.points.length, 'points,', flightPlan.lines.length, 'lines');
  }, [flightPlan]);
  const { drawingState, startDrawing, stopDrawing, addPoint, updatePreviewLine, clearCurrentPoints } = useDrawing();

  // Safe function to fetch and parse tile info JSON
  const fetchTileInfo = async (): Promise<TileInfo | null> => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('http://localhost:8000/tiles/tiles_info.json', {
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
    const tileLayer = createTileLayer(tileInfo, regionBounds, transverseMercatorProjection);
    const gridLayer = createGridLayer(regionBounds, transverseMercatorProjection);
    const flightPlanLayer = createFlightPlanLayer(flightPlan, transverseMercatorProjection);
    flightPlanLayer.set('name', 'flightplan');
    
    console.log('Created initial flight plan layer with', flightPlan.points.length, 'points and', flightPlan.lines.length, 'lines');
    
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

      if (drawingState.isDrawing) {
        // In drawing mode, add points to the current drawing
        addPoint(coordinate);
      } else {
        // Not in drawing mode, add turn points directly to flight plan
        setFlightPlan((flightPlan) => flightPlanUtils.addTurnPoint(flightPlan, coordinate[1], coordinate[0]));
      }
    };
    
    mapInstanceRef.current.on('click', clickHandler);
    (mapInstanceRef.current as any).__clickHandler = clickHandler;
  }, [drawingState.isDrawing, addPoint]);

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
      if (drawingState.isDrawing) {
        updatePreviewLine(coordinate);
      }
    };
    
    mapInstanceRef.current.on('pointermove', moveHandler);
    (mapInstanceRef.current as any).__moveHandler = moveHandler;
  }, [onCoordinateChange, drawingState.isDrawing, updatePreviewLine, tileInfo]);

  // Handle adding points to flight plan in real-time during drawing
  useEffect(() => {
    console.log('🔄 DRAWING STATE EFFECT - isDrawing:', drawingState.isDrawing, 'points:', drawingState.currentPoints.length);
    
    // Add points to flight plan as they're drawn (when currentPoints changes)
    if (drawingState.isDrawing && drawingState.currentPoints.length > 0) {
      const latestPoint = drawingState.currentPoints[drawingState.currentPoints.length - 1];
      
      setFlightPlan(prevPlan => {
        // Only add if this point isn't already in the flight plan
        const pointExists = prevPlan.points.some(p => 
          Math.abs(p.lat - latestPoint.lat) < 0.0001 && Math.abs(p.lon - latestPoint.lon) < 0.0001
        );
        
        if (!pointExists) {
          console.log('📍 Adding point to flight plan in real-time:', latestPoint);
          let updatedPlan = flightPlanUtils.addTurnPoint(prevPlan, latestPoint.lat, latestPoint.lon);
          
          // Add line to previous point if there are at least 2 points in current drawing
          if (drawingState.currentPoints.length > 1) {
            const previousPoint = drawingState.currentPoints[drawingState.currentPoints.length - 2];
            updatedPlan = flightPlanUtils.addLine(updatedPlan, previousPoint, latestPoint);
            console.log('🔗 Added line to flight plan in real-time:', previousPoint, '→', latestPoint);
          }
          
          return updatedPlan;
        }
        
        return prevPlan;
      });
    }
    
    // Clear current points when drawing stops
    if (!drawingState.isDrawing && drawingState.currentPoints.length > 0) {
      console.log('🧹 Drawing stopped, clearing current points');
      setTimeout(() => {
        clearCurrentPoints();
      }, 100);
    }
  }, [drawingState.currentPoints, drawingState.isDrawing, clearCurrentPoints]);

  // Update flight plan layer when flight plan changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    console.log('Flight plan layer update effect triggered. Points:', flightPlan.points.length, 'Lines:', flightPlan.lines.length);

    // Find and remove the existing flight plan layer
    const layers = mapInstanceRef.current.getLayers().getArray();
    console.log('Available layers:', layers.map((layer: any) => layer.get('name')));
    
    const existingFlightPlanLayer = layers.find((layer: any) => 
      layer.get('name') === 'flightplan'
    );

    if (existingFlightPlanLayer) {
      console.log('Removing existing flight plan layer');
      mapInstanceRef.current.removeLayer(existingFlightPlanLayer);
    }

    // Create a new flight plan layer with current data
    const newFlightPlanLayer = createFlightPlanLayer(flightPlan, mapInstanceRef.current.getView().getProjection());
    newFlightPlanLayer.set('name', 'flightplan');
    
    // Add the new layer to the map
    mapInstanceRef.current.addLayer(newFlightPlanLayer);
    console.log('Added new flight plan layer with', flightPlan.points.length, 'points and', flightPlan.lines.length, 'lines');
  }, [flightPlan]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
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
      
      {/* Drawing Controls */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4">
        <div className="flex flex-col gap-2">
          <button
            onClick={() => {
              if (drawingState.isDrawing) {
                stopDrawing(mapInstanceRef.current!);
              } else {
                startDrawing(mapInstanceRef.current!, flightPlan);
              }
            }}
            className={`px-4 py-2 rounded font-medium transition-colors ${
              drawingState.isDrawing
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {drawingState.isDrawing ? 'Stop Drawing' : 'Draw Line'}
          </button>
          
          {drawingState.isDrawing && (
            <p className="text-sm text-gray-600 text-center">
              Click to place points. Click "Stop Drawing" when done.
            </p>
          )}
          
          <div className="text-xs text-gray-500">
            <p>Turn Points: {flightPlan.points.length}</p>
            <p>Lines: {flightPlan.lines.length}</p>
            {drawingState.isDrawing && (
              <p>Drawing Points: {drawingState.currentPoints.length}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapComponent;

