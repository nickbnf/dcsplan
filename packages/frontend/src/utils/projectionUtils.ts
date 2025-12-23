import { get, transform } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import type { Bounds } from './latLonGrid';

/**
 * Creates a transverse Mercator projection with the specified central meridian
 */
export const createTransverseMercatorProjection = (centralMeridian: number = 39) => {
  const falseEasting = 0;
  const falseNorthing = 0;
  const scaleFactor = 1.0;
  
  // Define the projection code
  const projectionCode = 'EPSG:123456'; // Custom code for our projection
  
  // Create PROJ.4 definition string for transverse Mercator
  const proj4Def = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=${scaleFactor} +x_0=${falseEasting} +y_0=${falseNorthing} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;
  
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

/**
 * Transforms geographic bounds to transverse Mercator coordinates
 */
export const transformBoundsToTransverseMercator = (
  bounds: Bounds,
  projection: any
) => {
  const transformedMin = transform([bounds.minLon, bounds.minLat], 'EPSG:4326', projection.getCode());
  const transformedMax = transform([bounds.maxLon, bounds.maxLat], 'EPSG:4326', projection.getCode());
  
  return [
    transformedMin[0],  // minX in meters
    transformedMin[1],  // minY in meters
    transformedMax[0],  // maxX in meters
    transformedMax[1]   // maxY in meters
  ];
};

/**
 * Calculates the center point in transverse Mercator coordinates
 */
export const calculateTransverseMercatorCenter = (
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  projection: any
) => {
  const geographicCenter = [(bounds.minLon + bounds.maxLon) / 2, (bounds.minLat + bounds.maxLat) / 2];
  return transform(geographicCenter, 'EPSG:4326', projection.getCode());
};
