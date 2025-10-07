import React, { useRef, useEffect, useState } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import XYZ from 'ol/source/XYZ';
import { get, transform } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import TileGrid from 'ol/tilegrid/TileGrid';
import { LineString } from 'ol/geom';
import Feature from 'ol/Feature';
import { Style, Stroke } from 'ol/style';
import type { Size } from 'ol/size';
import ImageTileSource from 'ol/source/ImageTile';

interface MapComponentProps {
  onCoordinateChange?: (coord: { raw_x: number; raw_y: number; lat: number; lon: number } | null) => void;
}

interface TileInfo {
  zoom_info?: {
    zoom: number;
    nb_tiles_w: number;
    nb_tiles_h: number;
    width_px: number;
    height_px: number;
  }[];
  bounds?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  [key: string]: any; // Allow for additional properties
}

const MapComponent: React.FC<MapComponentProps> = ({ onCoordinateChange }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tileInfo, setTileInfo] = useState<TileInfo | null>(null);

  // Define transverse Mercator projection with 39° central meridian
  const createTransverseMercatorProjection = () => {
    const centralMeridian = 39; // 39 degrees
    const falseEasting = 0;
    const falseNorthing = 0;
    const scaleFactor = 1.0;
    
    // Define the projection code
    const projectionCode = 'EPSG:123456'; // Custom code for our projection
    
    // Create PROJ.4 definition string for transverse Mercator
    const proj4Def = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=${scaleFactor} +x_0=${falseEasting} +y_0=${falseNorthing} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
    console.log('Transverse Mercator PROJ.4 definition:', proj4Def);
    
    // Register the projection with PROJ.4
    proj4.defs(projectionCode, proj4Def);
    
    // Register with OpenLayers
    register(proj4);
    
    // Get the projection from OpenLayers registry
    const projection = get(projectionCode);
    if (!projection) {
      throw new Error(`Failed to get projection ${projectionCode}`);
    }
    
    // Set extent for the projection
    projection.setExtent([-20000000, -20000000, 20000000, 20000000]);
    
    return { projection };
  };

  // Create grid features for parallels and meridians
  const createGridFeatures = (projection: any, bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => {
    const features: Feature[] = [];
    
    // Define grid spacing (in degrees)
    const gridSpacing = 1; // 1 degree spacing
    
    // Create parallels (horizontal lines)
    const minLatGrid = Math.floor(bounds.minLat / gridSpacing) * gridSpacing;
    const maxLatGrid = Math.ceil(bounds.maxLat / gridSpacing) * gridSpacing;
    
    for (let lat = minLatGrid; lat <= maxLatGrid; lat += gridSpacing) {
      // Skip if outside bounds
      if (lat < bounds.minLat || lat > bounds.maxLat) continue;
      
      const lineCoords: number[][] = [];
      
      // Create line segments across longitude range
      const numSegments = Math.max(10, Math.floor((bounds.maxLon - bounds.minLon) / 0.1));
      for (let i = 0; i <= numSegments; i++) {
        const lon = bounds.minLon + (i / numSegments) * (bounds.maxLon - bounds.minLon);
        const transformedCoord = transform([lon, lat], 'EPSG:4326', projection.getCode());
        lineCoords.push(transformedCoord);
      }
      
      const lineString = new LineString(lineCoords);
      const feature = new Feature(lineString);
      feature.set('type', 'parallel');
      feature.set('value', lat);
      features.push(feature);
    }
    
    // Create meridians (vertical lines)
    const minLonGrid = Math.floor(bounds.minLon / gridSpacing) * gridSpacing;
    const maxLonGrid = Math.ceil(bounds.maxLon / gridSpacing) * gridSpacing;
    
    for (let lon = minLonGrid; lon <= maxLonGrid; lon += gridSpacing) {
      // Skip if outside bounds
      if (lon < bounds.minLon || lon > bounds.maxLon) continue;
      
      const lineCoords: number[][] = [];
      
      // Create line segments across latitude range
      const numSegments = Math.max(10, Math.floor((bounds.maxLat - bounds.minLat) / 0.1));
      for (let i = 0; i <= numSegments; i++) {
        const lat = bounds.minLat + (i / numSegments) * (bounds.maxLat - bounds.minLat);
        const transformedCoord = transform([lon, lat], 'EPSG:4326', projection.getCode());
        lineCoords.push(transformedCoord);
      }
      
      const lineString = new LineString(lineCoords);
      const feature = new Feature(lineString);
      feature.set('type', 'meridian');
      feature.set('value', lon);
      features.push(feature);
    }
    
    return features;
  };

  // Create grid layer with styling
  const createGridLayer = (projection: any, bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number }) => {
    const features = createGridFeatures(projection, bounds);
    const source = new VectorSource({ features });
    
    const layer = new VectorLayer({
      source: source,
      style: (feature) => {
        const type = feature.get('type');
        
        return new Style({
          stroke: new Stroke({
            color: type === 'parallel' ? 'rgba(74, 144, 226, 0.6)' : 'rgba(226, 74, 74, 0.6)', // Blue for parallels, red for meridians
            width: 1
          })
        });
      }
    });
    
    return layer;
  };

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

    const originGeo = [regionBounds.minLon, regionBounds.maxLat];

    const tileSize = tileInfo?.tileSize ?? 256;

    console.log("Using bounds:", regionBounds);

    // Create transverse Mercator projection with 39° central meridian
    console.log("Using transverse Mercator projection with 39° central meridian");
    
    const { projection: transverseMercatorProjection } = createTransverseMercatorProjection();
    
    // Transform geographic bounds to transverse Mercator coordinates
    const geographicExtent = [
      regionBounds.minLon,  // minX = minLon
      regionBounds.minLat,   // minY = minLat  
      regionBounds.maxLon,   // maxX = maxLon
      regionBounds.maxLat    // maxY = maxLat
    ];

    const cornerNW = [29.9266, 37.50575];
    const cornerNE = [41.695, 37.8254];
    const cornerNWTransverseMercator = transform(cornerNW, 'EPSG:4326', transverseMercatorProjection.getCode());
    const cornerNETransverseMercator = transform(cornerNE, 'EPSG:4326', transverseMercatorProjection.getCode());
    console.log("Corner NW transverse Mercator:", cornerNWTransverseMercator);
    console.log("Corner NE transverse Mercator:", cornerNETransverseMercator);
    const line = new LineString([cornerNWTransverseMercator, cornerNETransverseMercator]);
    const xDistance = line.getLength();
    console.log("Distance:", xDistance);

    const originTransverseMercator = transform(originGeo, 'EPSG:4326', transverseMercatorProjection.getCode());
    console.log("Origin transverse Mercator:", originTransverseMercator);
    console.log("Geographic extent (lon/lat):", geographicExtent);
    
    // Transform the geographic extent to transverse Mercator coordinates
    const transformedMin = transform([regionBounds.minLon, regionBounds.minLat], 'EPSG:4326', transverseMercatorProjection.getCode());
    const transformedMax = transform([regionBounds.maxLon, regionBounds.maxLat], 'EPSG:4326', transverseMercatorProjection.getCode());
    
    const transverseMercatorExtent = [
      transformedMin[0],  // minX in meters
      transformedMin[1],  // minY in meters
      transformedMax[0],  // maxX in meters
      transformedMax[1]   // maxY in meters
    ];

    console.log("Transverse Mercator extent (meters):", transverseMercatorExtent);
    
    // Set the projection extent
    transverseMercatorProjection.setExtent(transverseMercatorExtent);

    // Calculate resolutions for zoom levels using transverse Mercator meters
    // Resolution will be in meters per pixel
    const resolutions: number[] = [];
    const sizes: Size[] = [];
    console.log("Width:", transverseMercatorExtent[2] - transverseMercatorExtent[0]);
    for (const zoomInfo of tileInfo?.zoom_info || []) {
      const resolution = xDistance / zoomInfo.width_px;
      resolutions.push(resolution);
      sizes.push([zoomInfo.nb_tiles_w, zoomInfo.nb_tiles_h]);
    }

    console.log("Resolutions:", resolutions.length, "levels", resolutions);

    // Create custom tile grid for transverse Mercator projection
    const tileGrid = new TileGrid({
      // extent: transverseMercatorExtent,
      minZoom: 0,
      resolutions: resolutions,
      sizes: sizes,
      tileSize: tileSize,
      origin: cornerNWTransverseMercator
    });

    // Calculate center in transverse Mercator coordinates
    const geographicCenter = [(regionBounds.minLon + regionBounds.maxLon) / 2, (regionBounds.minLat + regionBounds.maxLat) / 2];
    const transverseMercatorCenter = transform(geographicCenter, 'EPSG:4326', transverseMercatorProjection.getCode());

    // Create grid layer for parallels and meridians
    const gridLayer = createGridLayer(transverseMercatorProjection, regionBounds);

    mapInstanceRef.current = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new ImageTileSource({
            url: 'http://localhost:8000/tiles/{z}/{x}/{y}.png',
            projection: transverseMercatorProjection,
            tileGrid: tileGrid
          })
        }),
        gridLayer
      ],
      view: new View({
        projection: transverseMercatorProjection,
        center: transverseMercatorCenter,
        zoom: 2,
        maxZoom: resolutions.length - 1,
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
