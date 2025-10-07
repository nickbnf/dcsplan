import { LineString } from 'ol/geom';
import Feature from 'ol/Feature';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Style, Stroke } from 'ol/style';
import { transform } from 'ol/proj';

export interface Bounds {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * Creates grid features for parallels and meridians
 */
export const createGridFeatures = (projection: any, bounds: Bounds): Feature[] => {
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

/**
 * Creates grid layer with styling
 */
export const createGridLayer = (bounds: Bounds, projection: any): VectorLayer => {
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
