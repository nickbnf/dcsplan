import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import ImageTileSource from 'ol/source/ImageTile';
import { LineString } from 'ol/geom';
import { transform } from 'ol/proj';
import type { Size } from 'ol/size';

export interface TileInfo {
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

/**
 * Creates a custom tile grid for transverse Mercator projection
 */
export const createTileGrid = (
  tileInfo: TileInfo,
  _bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  projection: any
) => {
  const tileSize = tileInfo?.tileSize ?? 256;
  
  // Calculate distance for resolution calculation
  const cornerNW = [29.9266, 37.50575];
  const cornerNE = [41.695, 37.8254];
  const cornerNWTransverseMercator = transform(cornerNW, 'EPSG:4326', projection.getCode());
  const cornerNETransverseMercator = transform(cornerNE, 'EPSG:4326', projection.getCode());
  const line = new LineString([cornerNWTransverseMercator, cornerNETransverseMercator]);
  const xDistance = line.getLength();
  
  // Calculate resolutions for zoom levels using transverse Mercator meters
  const resolutions: number[] = [];
  const sizes: Size[] = [];
  
  for (const zoomInfo of tileInfo?.zoom_info || []) {
    const resolution = xDistance / zoomInfo.width_px;
    resolutions.push(resolution);
    sizes.push([zoomInfo.nb_tiles_w, zoomInfo.nb_tiles_h]);
  }

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
  tileInfo: TileInfo,
  bounds: { minLon: number; minLat: number; maxLon: number; maxLat: number },
  projection: any,
  baseUrl?: string
) => {
  // Default to localhost for development if not provided
  const defaultBaseUrl = baseUrl || 'http://localhost:8000/tiles/{z}/{x}/{y}.png';
  const tileGrid = createTileGrid(tileInfo, bounds, projection);
  
  return new TileLayer({
    source: new ImageTileSource({
      url: defaultBaseUrl,
      projection: projection,
      tileGrid: tileGrid
    })
  });
};
