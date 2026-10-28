import { describe, it, expect } from 'vitest';
import { transform } from 'ol/proj';
import {
  calculateResolutions,
  createTileGrid,
  imageExtent,
  imageGeographicBounds,
  projectedToNativePixel,
} from './tileLayer';
import type { MapInfo } from './tileLayer';
import { createProjectionFromCrs } from './projectionUtils';

const TMERC_21 = '+proj=tmerc +lat_0=0 +lon_0=21 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs';
const LCC_10 = '+proj=lcc +lat_0=0 +lon_0=10.5 +lat_1=50 +lat_2=54 +ellps=WGS84 +units=m +no_defs';
const WEB_MERCATOR =
  '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs';

describe('createProjectionFromCrs', () => {
  // Frankfurt ARP projected with pyproj (the backend) for each CRS.
  const frankfurt: [number, number] = [8.5706, 50.0333];
  it.each([
    ['tmerc', TMERC_21, [-889253.7545297897, 5619010.582816382]],
    ['lcc', LCC_10, [-138215.252290013, 6306770.985963646]],
    ['web mercator', WEB_MERCATOR, [954074.8277928305, 6452044.812879923]],
  ])('projects like pyproj (%s)', (name, crs, expected) => {
    const { projection } = createProjectionFromCrs(`map:test/${name}`, crs);
    const [x, y] = transform(frankfurt, 'EPSG:4326', projection);
    expect(x).toBeCloseTo(expected[0], 2);
    expect(y).toBeCloseTo(expected[1], 2);
  });
});

describe('tile grid from the projected georeference', () => {
  // Germany default as converted from its legacy corners (georeference-control-points
  // D7 step 1), with the origin and per-zoom resolutions of the legacy formula.
  const germany = {
    crs: TMERC_21,
    origin_x: -1346842.85186377,
    origin_y: 6326528.806716395,
    resolution: 32.01808476599822,
    image_width_px: 40960,
    image_height_px: 32768,
    zoom_info: [160, 320, 640, 1280, 2560, 5120, 10240, 20480, 40960].map((width_px, zoom) => ({
      zoom,
      nb_tiles_w: Math.ceil(width_px / 256),
      nb_tiles_h: Math.ceil((width_px * 0.8) / 256),
      width_px,
      height_px: width_px * 0.8,
    })),
  } as MapInfo;
  const legacyResolutions = [
    8196.629700095544, 4098.314850047772, 2049.157425023886, 1024.578712511943, 512.2893562559715,
    256.14467812798574, 128.07233906399287, 64.03616953199644, 32.01808476599822,
  ];

  it('derives each zoom level resolution from the native resolution', () => {
    const resolutions = calculateResolutions(germany);
    resolutions.forEach((resolution, i) => expect(resolution).toBeCloseTo(legacyResolutions[i], 9));
  });

  it('anchors the grid at the projected origin', () => {
    const grid = createTileGrid(germany);
    expect(grid.getOrigin(0)).toEqual([germany.origin_x, germany.origin_y]);
    expect(grid.getResolutions()).toEqual(calculateResolutions(germany));
  });

  it('gives the native pixel of a projected point, (0.5, 0.5) at the top-left pixel centre', () => {
    const r = germany.resolution;
    expect(projectedToNativePixel(germany, germany.origin_x, germany.origin_y)).toEqual({ px: 0, py: 0 });
    const { px, py } = projectedToNativePixel(germany, germany.origin_x + 0.5 * r, germany.origin_y - 0.5 * r);
    expect(px).toBeCloseTo(0.5, 9);
    expect(py).toBeCloseTo(0.5, 9);
    const end = projectedToNativePixel(germany, germany.origin_x + 40960 * r, germany.origin_y - 32768 * r);
    expect(end.px).toBeCloseTo(40960, 6);
    expect(end.py).toBeCloseTo(32768, 6);
  });

  it('uses the width of each level, not a power of two', () => {
    const map = {
      ...germany,
      image_width_px: 18535,
      zoom_info: [{ zoom: 0, nb_tiles_w: 1, nb_tiles_h: 1, width_px: 144, height_px: 96 }],
    } as MapInfo;
    expect(calculateResolutions(map)[0]).toBeCloseTo((germany.resolution * 18535) / 144, 9);
  });
});

describe('image extent and geographic bounds from the georeference', () => {
  const lcc = {
    crs: LCC_10,
    origin_x: -700000,
    origin_y: 6900000,
    resolution: 50,
    image_width_px: 28000,
    image_height_px: 20000,
    zoom_info: [],
  } as unknown as MapInfo;

  it('spans the whole image', () => {
    expect(imageExtent(lcc)).toEqual([-700000, 5900000, 700000, 6900000]);
  });

  // Expected values from map_georeference.derive_bounds (pyproj), removed from
  // the backend when bounds stopped being stored (georeference-control-points D3).
  it.each([
    ['tmerc', TMERC_21, { origin_x: -1346842.85186377, origin_y: 6326528.806716395, resolution: 32.01808476599822,
      image_width_px: 40960, image_height_px: 32768 },
      { minLon: -0.32, minLat: 46.27375076154808, maxLon: 20.52922898143963, maxLat: 57.058044133893155 }],
    ['lcc', LCC_10, { origin_x: -700000, origin_y: 6900000, resolution: 50, image_width_px: 28000, image_height_px: 20000 },
      { minLon: -0.4472346228986579, minLat: 46.00825853670239, maxLon: 21.44723462289866, maxLat: 55.3816047451149 }],
  ])('encloses the image outline like pyproj (%s)', (name, crs, georeference, expected) => {
    const { projection } = createProjectionFromCrs(`map:bounds/${name}`, crs);
    const bounds = imageGeographicBounds({ crs, zoom_info: [], ...georeference } as unknown as MapInfo, projection);
    (Object.keys(expected) as (keyof typeof expected)[]).forEach((key) =>
      expect(bounds[key]).toBeCloseTo(expected[key], 6)
    );
  });

  it('takes the extreme latitude mid-edge, not at a corner', () => {
    const { projection } = createProjectionFromCrs('map:bounds/lcc-mid', LCC_10);
    const bounds = imageGeographicBounds(lcc, projection);
    const [, topLeftLat] = transform([-700000, 6900000], projection, 'EPSG:4326');
    expect(bounds.maxLat).toBeGreaterThan(topLeftLat + 0.1);
  });
});
