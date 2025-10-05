import React, { useRef, useEffect } from 'react';
import 'ol/ol.css';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import XYZ from 'ol/source/XYZ';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import { get } from 'ol/proj';
import { fromLonLat, toLonLat } from 'ol/proj';
import TileGrid from 'ol/tilegrid/TileGrid';
import type { Size } from 'ol/size';

interface MapComponentProps {
  onCoordinateChange?: (coord: { lat: number; lon: number } | null) => void;
}

const MapComponent: React.FC<MapComponentProps> = ({ onCoordinateChange }) => {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('Map useEffect running, mapRef.current:', mapRef.current);
    if (!mapRef.current) return;

    // Define your region bounds in longitude/latitude (geographic coordinates)
    // Adjust these to match your actual map coverage area
    const regionBounds = {
      minLon: 29.9,   // Western boundary
      minLat: 31.4,   // Southern boundary
      maxLon: 41.72,  // Eastern boundary  
      maxLat: 37.8    // Northern boundary
    };

    // Use standard WGS84 Geographic projection (EPSG:4326)
    // This uses standard latitude/longitude coordinates in degrees
    console.log("Using standard EPSG:4326 (WGS84 Geographic) projection");
    
    // EPSG:4326 imports automatically, just get it
    const geographicProjection = get('EPSG:4326');
    if (!geographicProjection) {
      throw new Error('Failed to get EPSG:4326 projection');
    }

    // For geographic projection, extent is defined directly in lat/lon degrees
    const geographicExtent = [
      regionBounds.minLon,  // minX = minLon
      regionBounds.minLat,   // minY = minLat  
      regionBounds.maxLon,   // maxX = maxLon
      regionBounds.maxLat    // maxY = maxLat
    ];

    console.log("Geographic extent (lon/lat):", geographicExtent);
    
    // Set the projection extent
    geographicProjection.setExtent(geographicExtent);

    // Calculate resolutions for zoom levels 0-7 using geographic degrees
    // Resolution will be in degrees per pixel
    const longitudeWidth = regionBounds.maxLon - regionBounds.minLon;
    const resolutions: number[] = [];
    const sizes: Size[] = [];
    for (let z = 0; z <= 7; z++) {
      const resolution = longitudeWidth / (Math.pow(2, z) * 256); // degrees per pixel
      resolutions.push(resolution);
      sizes.push([Math.pow(2, z), Math.pow(2, z)]);
    }

    console.log("Longitude width:", longitudeWidth, "degrees");
    // console.log("Number of resolutions:", resolutions.length);
    // console.log("Resolutions:", resolutions.slice(0, 3), "...");

    // Create custom tile grid for geographic projection
    // Based on tile generation: tile 0/0/0 = top-left corner of image
    // For geographic coordinates: origin = [minLon, maxLat] (top-left corner in degrees)
    const tileGrid = new TileGrid({
      extent: geographicExtent,
      minZoom: 3,  // Match the resolution array
      resolutions: resolutions,
      sizes: sizes,
      tileSize: 256,
      origin: [regionBounds.minLon, regionBounds.maxLat]  // [minLon, maxLat] = top-left corner
    });

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'http://localhost:8000/tiles/{z}/{x}/{y}.png',
            projection: geographicProjection,
            tileGrid: tileGrid,
            tileUrlFunction: (coordinate) => {
              const z = coordinate[0];
              const x = coordinate[1]; 
              const y = coordinate[2];
              const url = `http://localhost:8000/tiles/${z}/${x}/${y}.png`;
              console.log(`Requesting tile: z=${z}, x=${x}, y=${y} -> ${url}`);
              return url;
            }
          })
        })
      ],
      view: new View({
        projection: geographicProjection,
        center: [(regionBounds.minLon + regionBounds.maxLon) / 2, (regionBounds.minLat + regionBounds.maxLat) / 2],
        zoom: 5,
        maxZoom: 7,
        minZoom: 3,  // Match the tile grid minZoom
        extent: geographicExtent,
        constrainResolution: true,  // Snap to zoom levels
        multiWorld: false
      })
    });

    // Add map event listeners for debugging
    map.on('loadstart', () => console.log('Map loading started'));
    map.on('loadend', () => console.log('Map loading ended'));
    
    // Add mouse pointer tracking
    if (onCoordinateChange) {
      map.on('pointermove', (event) => {
        const coordinate = event.coordinate;
        if (coordinate) {
          // With geographic projection, coordinates are already in lat/lon degrees
          // coordinate[0] = longitude, coordinate[1] = latitude
          onCoordinateChange({
            lon: coordinate[0],
            lat: coordinate[1]
          });
        }
      });
    }

    return () => {
      map.setTarget(undefined);
    };
  }, []);

  return <div ref={mapRef} className="w-full h-full" />;
};

export default MapComponent;
