import React, { useRef, useEffect, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import { transform } from 'ol/proj';
import { createTransverseMercatorProjection, transformBoundsToTransverseMercator, calculateTransverseMercatorCenter } from '../utils/projectionUtils';
import { createGridLayer } from '../utils/latLonGrid';
import { createTileLayer, type TileInfo } from '../utils/tileLayer';

interface MapComponentProps {
  onCoordinateChange?: (coord: { raw_x: number; raw_y: number; lat: number; lon: number } | null) => void;
}


const MapComponent: React.FC<MapComponentProps> = ({ onCoordinateChange }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tileInfo, setTileInfo] = useState<TileInfo | null>(null);



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

    mapInstanceRef.current = new Map({
      target: mapRef.current,
      layers: [
        tileLayer,
        gridLayer
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

    // Add mouse pointer tracking
    if (onCoordinateChange && mapInstanceRef.current) {
      mapInstanceRef.current.on('pointermove', (event) => {
        const coordinate = event.coordinate;
        if (coordinate) {
          // Transform transverse Mercator coordinates back to geographic coordinates
          const geographicCoordinate = transform(coordinate, transverseMercatorProjection.getCode(), 'EPSG:4326');
          // geographicCoordinate[0] = longitude, geographicCoordinate[1] = latitude
          onCoordinateChange({
            raw_x: coordinate[0],
            raw_y: coordinate[1],
            lon: geographicCoordinate[0],
            lat: geographicCoordinate[1]
          });
        }
      });
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setTarget(undefined);
        mapInstanceRef.current = null;
      }
    };
  }, [tileInfo, isLoading]); // This effect runs when tileInfo or isLoading changes

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

  return <div ref={mapRef} className="w-full h-full" />;
};

export default MapComponent;
