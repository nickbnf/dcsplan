import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import ImageTileSource from 'ol/source/ImageTile';
import { LineString } from 'ol/geom';
import { transform } from 'ol/proj';
import type { Size } from 'ol/size';
import type { Bounds } from './latLonGrid';

export interface MapInfo {
  central_meridian: number;
  std_parallel1: number;
  std_parallel2: number;
  origin_lat: number;
  origin_lon: number;
  ref_corner_ne_lat: number;
  ref_corner_ne_lon: number;
  zoom_info: {
    zoom: number;
    nb_tiles_w: number;
    nb_tiles_h: number;
    width_px: number;
    height_px: number;
  }[];
  bounds: Bounds;
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  [key: string]: any; // Allow for additional properties
}

/**
 * Calculates resolutions for each zoom level in transverse Mercator meters per pixel.
 * Must be used for both the TileGrid and the View so they share the same resolution set.
 */
export const calculateResolutions = (
  mapInfo: MapInfo,
  projection: any
): number[] => {
  const cornerNW = [mapInfo.origin_lon, mapInfo.origin_lat];
  const cornerNE = [mapInfo.ref_corner_ne_lon, mapInfo.ref_corner_ne_lat];
  const projCode = projection.getCode();
  const cornerNWTransverseMercator = transform(cornerNW, 'EPSG:4326', projCode);
  const cornerNETransverseMercator = transform(cornerNE, 'EPSG:4326', projCode);
  const line = new LineString([cornerNWTransverseMercator, cornerNETransverseMercator]);
  const xDistance = line.getLength();

  return (mapInfo?.zoom_info || []).map(
    (zoomInfo) => xDistance / zoomInfo.width_px
  );
};

/**
 * Creates a custom tile grid for transverse Mercator projection
 */
export const createTileGrid = (
  mapInfo: MapInfo,
  projection: any
) => {
  const tileSize = mapInfo?.tileSize ?? 256;

  const cornerNW = [mapInfo.origin_lon, mapInfo.origin_lat];
  const projCode = projection.getCode();
  const cornerNWTransverseMercator = transform(cornerNW, 'EPSG:4326', projCode);

  const resolutions = calculateResolutions(mapInfo, projection);
  const sizes: Size[] = (mapInfo?.zoom_info || []).map(
    (zoomInfo) => [zoomInfo.nb_tiles_w, zoomInfo.nb_tiles_h] as Size
  );

  console.log("Resolutions:", resolutions.length, "levels", resolutions);

  // Create custom tile grid for transverse Mercator projection
  return new TileGrid({
    minZoom: 0,
    resolutions: resolutions,
    sizes: sizes,
    tileSize: tileSize,
    origin: cornerNWTransverseMercator
  });
};

/**
 * Creates a tile layer with the specified configuration
 */
export const createTileLayer = (
  mapInfo: MapInfo,
  projection: any,
  baseUrl?: string
) => {
  // Default to localhost for development if not provided
  const defaultBaseUrl = baseUrl || 'http://localhost:8000/tiles/{z}/{x}/{y}.png';
  const tileGrid = createTileGrid(mapInfo, projection);
  
  return new TileLayer({
    source: new ImageTileSource({
      url: defaultBaseUrl,
      projection: projection,
      tileGrid: tileGrid,
      wrapX: false
    })
  });
};
