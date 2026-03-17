import { get, transform } from 'ol/proj';
import { register } from 'ol/proj/proj4';
import proj4 from 'proj4';
import type { Bounds } from './latLonGrid';
import type Projection from 'proj4/dist/lib/Proj';

/**
 * Creates a transverse Mercator projection with the specified central meridian
 */
export const createMapProjection = (projectionType: string, centralMeridian: number, stdParallel1: number, stdParallel2: number) => {
  const falseEasting = 0;
  const falseNorthing = 0;
  const scaleFactor = 1.0;
  
  let projection: Projection | null = null;

  if (projectionType === 'transverse_mercator') {
    const projectionCode = `custom:tmerc_${centralMeridian}`;

    const proj4Def = `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=${scaleFactor} +x_0=${falseEasting} +y_0=${falseNorthing} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;

    proj4.defs(projectionCode, proj4Def);
    register(proj4);

    projection = get(projectionCode) as Projection | null;
    if (!projection) {
      throw new Error(`Failed to get projection ${projectionCode}`);
    }
  } else if (projectionType === 'mercator') {
    projection = get('EPSG:3857') as Projection | null;
    if (!projection) {
      throw new Error(`Failed to get projection EPSG:3857`);
    }
  } else if (projectionType === 'lambert_conformal_conic') {
    const projectionCode = `custom:lcc_${centralMeridian}_${stdParallel1}_${stdParallel2}`;

    const proj4Def = `+proj=lcc +lat_0=0 +lon_0=${centralMeridian} +lat_1=${stdParallel1} +lat_2=${stdParallel2} +ellps=WGS84 +datum=WGS84 +units=m +no_defs`;

    proj4.defs(projectionCode, proj4Def);
    register(proj4);

    projection = get(projectionCode) as Projection | null;
    if (!projection) {
      throw new Error(`Failed to get projection ${projectionCode}`);
    }
  } else {
    throw new Error(`Unsupported projection type: ${projectionType}`);
  }
  
  if (projection) {
    // Set extent for the projection
    (projection as any).setExtent([-20000000, -20000000, 20000000, 20000000]);
    
    return { projection };
  } else {
    throw new Error(`Failed to create projection ${projectionType}`);
  }
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
