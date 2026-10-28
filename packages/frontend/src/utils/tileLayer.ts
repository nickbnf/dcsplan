import TileLayer from 'ol/layer/Tile';
import TileGrid from 'ol/tilegrid/TileGrid';
import ImageTileSource from 'ol/source/ImageTile';
import { transform } from 'ol/proj';
import type { ProjectionLike } from 'ol/proj';
import type { Extent } from 'ol/extent';
import type { Size } from 'ol/size';
import type { Bounds } from './latLonGrid';

export interface ControlPoint {
  label?: string;
  px: number;
  py: number;
  // Decimal degrees, or degrees and decimal minutes as DCS shows them ("N 41°55.678'")
  lat: number | string;
  lon: number | string;
}

/**
 * A map config (georeference-control-points): `crs` is the map's proj string,
 * `origin_x`/`origin_y` the projected position of the image's outer top-left
 * corner and `resolution` the projected metres per native pixel.
 */
export interface MapInfo {
  crs: string;
  origin_x: number;
  origin_y: number;
  resolution: number;
  image_width_px: number;
  image_height_px: number;
  control_points?: ControlPoint[];
  alignment_tolerance_px?: number;
  zoom_info: {
    zoom: number;
    nb_tiles_w: number;
    nb_tiles_h: number;
    width_px: number;
    height_px: number;
  }[];
  minZoom?: number;
  maxZoom?: number;
  tileSize?: number;
  // Tile image pixels per tile grid pixel: 2 for high-DPI tiles, 1 when absent
  tile_pixel_ratio?: number;
  // Highest zoom level with tiles, the last zoom_info level when absent; the view
  // shows the levels above by scaling up its tiles
  max_tile_zoom?: number;
  [key: string]: any; // Allow for additional properties
}

/**
 * Calculates the resolution of each zoom level, in projected metres per pixel.
 * Each level covers the whole native image, resized to its width_px.
 * Must be used for both the TileGrid and the View so they share the same resolution set.
 */
export const calculateResolutions = (mapInfo: MapInfo): number[] =>
  (mapInfo?.zoom_info || []).map(
    (zoomInfo) => (mapInfo.resolution * mapInfo.image_width_px) / zoomInfo.width_px
  );

/**
 * The image's projected extent [minX, minY, maxX, maxY], from its georeference.
 */
export const imageExtent = (mapInfo: MapInfo): Extent => [
  mapInfo.origin_x,
  mapInfo.origin_y - mapInfo.resolution * mapInfo.image_height_px,
  mapInfo.origin_x + mapInfo.resolution * mapInfo.image_width_px,
  mapInfo.origin_y,
];

// Samples per image edge when computing geographic bounds: an edge is not a
// parallel or a meridian, so its extreme latitude/longitude can lie between the corners.
const BOUNDS_SAMPLES_PER_EDGE = 64;

/**
 * Smallest latitude/longitude box enclosing the whole image, from its outline
 * projected back to WGS84.
 */
export const imageGeographicBounds = (mapInfo: MapInfo, projection: ProjectionLike): Bounds => {
  const [minX, minY, maxX, maxY] = imageExtent(mapInfo);
  const outline: number[][] = [];
  for (let i = 0; i <= BOUNDS_SAMPLES_PER_EDGE; i++) {
    const x = minX + (i / BOUNDS_SAMPLES_PER_EDGE) * (maxX - minX);
    const y = minY + (i / BOUNDS_SAMPLES_PER_EDGE) * (maxY - minY);
    outline.push([x, maxY], [maxX, y], [x, minY], [minX, y]);
  }
  const lonLats = outline.map((point) => transform(point, projection, 'EPSG:4326'));
  const lons = lonLats.map(([lon]) => lon);
  const lats = lonLats.map(([, lat]) => lat);
  return {
    minLon: Math.min(...lons),
    minLat: Math.min(...lats),
    maxLon: Math.max(...lons),
    maxLat: Math.max(...lats),
  };
};

/**
 * Native image pixel position of a projected point, in the control point
 * convention: (0.5, 0.5) is the centre of the top-left pixel.
 */
export const projectedToNativePixel = (mapInfo: MapInfo, x: number, y: number) => ({
  px: (x - mapInfo.origin_x) / mapInfo.resolution,
  py: (mapInfo.origin_y - y) / mapInfo.resolution,
});

/**
 * The map's pixel ratio: the device's for high-DPI tiles, so that each tile
 * pixel lands on one screen pixel, and 1 otherwise, so that standard tiles are
 * not resampled.
 */
export const mapPixelRatio = (mapInfo: MapInfo): number =>
  (mapInfo?.tile_pixel_ratio ?? 1) > 1 ? window.devicePixelRatio || 1 : 1;

/**
 * Creates the map's tile grid, anchored at the image's top-left corner.
 * It stops at max_tile_zoom, while the view keeps every zoom_info level.
 */
export const createTileGrid = (mapInfo: MapInfo) => {
  const tileSize = mapInfo?.tileSize ?? 256;

  const tiledLevels = (mapInfo?.zoom_info || []).filter(
    (zoomInfo) => mapInfo.max_tile_zoom === undefined || zoomInfo.zoom <= mapInfo.max_tile_zoom
  );
  const resolutions = calculateResolutions(mapInfo).slice(0, tiledLevels.length);
  const sizes: Size[] = tiledLevels.map(
    (zoomInfo) => [zoomInfo.nb_tiles_w, zoomInfo.nb_tiles_h] as Size
  );

  return new TileGrid({
    minZoom: 0,
    resolutions: resolutions,
    sizes: sizes,
    tileSize: tileSize,
    origin: [mapInfo.origin_x, mapInfo.origin_y]
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
  const tileGrid = createTileGrid(mapInfo);
  const tileSize = (mapInfo?.tileSize ?? 256) * (mapInfo?.tile_pixel_ratio ?? 1);

  return new TileLayer({
    source: new ImageTileSource({
      url: defaultBaseUrl,
      projection: projection,
      tileGrid: tileGrid,
      tileSize: tileSize,
      wrapX: false
    })
  });
};
