import { useRef, useCallback, useState } from 'react';
import { transform } from 'ol/proj';
import { LineString, Point } from 'ol/geom';
import { Feature } from 'ol';
import { Stroke, Style } from 'ol/style';


export interface DrawingState {
  isDrawing: boolean;
  currentPoint: Point | null;
  previewLine: Point[] | null;
  lastConfirmedPoint: Point | null;
}

export const useDrawing = () => {
  const previewFeatureRef = useRef<Feature<LineString> | null>(null);
  const drawingLayerRef = useRef<any>(null);
  const mapProjectionRef = useRef<any>(null);
  
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    currentPoint: null,
    previewLine: null,
    lastConfirmedPoint: null
  });

  const startDrawing = useCallback((map: any, existingFlightPlan?: any) => {
    // Find the drawing layer
    const drawingLayer = map.getLayers().getArray().find((layer: any) => 
      layer.get('name') === 'drawing'
    );
    
    if (!drawingLayer) {
      console.error('Drawing layer not found');
      return;
    }
    
    drawingLayerRef.current = drawingLayer;
    mapProjectionRef.current = map.getView().getProjection();
    
    // Start with the last point of the existing flight plan if available
    const initialPoint = existingFlightPlan && existingFlightPlan.points.length > 0 
      ? new Point([existingFlightPlan.points[existingFlightPlan.points.length - 1].lon, existingFlightPlan.points[existingFlightPlan.points.length - 1].lat])
      : null;
    
    setDrawingState({
      isDrawing: true,
      currentPoint: initialPoint,
      previewLine: null,
      lastConfirmedPoint: initialPoint
    });
  }, []);

  const stopDrawing = useCallback((_map: any) => {
    // Clear preview line
    if (previewFeatureRef.current && drawingLayerRef.current) {
      const source = drawingLayerRef.current.getSource();
      if (source) {
        source.removeFeature(previewFeatureRef.current);
      }
      previewFeatureRef.current = null;
    }
    
    setDrawingState(prev => ({
      isDrawing: false,
      currentPoint: prev.currentPoint, // Keep the points for conversion
      previewLine: null,
      lastConfirmedPoint: prev.lastConfirmedPoint
    }));
    
  }, []);

  const addPoint = useCallback((coordinate: [number, number]) => {
    if (!mapProjectionRef.current) return;

    const [lon, lat] = transform(coordinate, mapProjectionRef.current.getCode(), 'EPSG:4326');
    const newPoint: Point = new Point([lon, lat]);
    
    setDrawingState(prev => ({
      ...prev,
      currentPoint: newPoint,
      lastConfirmedPoint: newPoint // Update the last confirmed point when a new point is added
    }));
    
  }, []);

  const updatePreviewLine = useCallback((coordinate: [number, number]) => {
    if (!mapProjectionRef.current || !drawingLayerRef.current) {
      return;
    }
    
    setDrawingState(prev => {
      // Use lastConfirmedPoint if available, otherwise use currentPoint
      const lastPoint = prev.lastConfirmedPoint || prev.currentPoint;
      
      if (lastPoint === null) {
        return prev; // No preview if no points yet
      }
      
      // Update preview line on map
      if (previewFeatureRef.current) {
        const source = drawingLayerRef.current.getSource();
        if (source) {
          source.removeFeature(previewFeatureRef.current);
        }
      }
      
      // Create new preview line feature
      // Transform the last confirmed point from EPSG:4326 to map projection
      const lastPointCoord = transform(lastPoint.getCoordinates(), 'EPSG:4326', mapProjectionRef.current.getCode());
      // Use the mouse coordinate directly (it's already in map projection)
      const previewCoord = coordinate;
      
      const previewFeature = new Feature({
        geometry: new LineString([lastPointCoord, previewCoord]),
        type: 'preview'
      });
      
      previewFeature.setStyle(new Style({
        stroke: new Stroke({
          color: 'orange',
          width: 2,
          lineDash: [10, 5]
        })
      }));
      
      const source = drawingLayerRef.current.getSource();
      if (source) {
        source.addFeature(previewFeature);
        previewFeatureRef.current = previewFeature;
      }
      
      return {
        ...prev,
        previewLine: [lastPoint, new Point(transform(coordinate, mapProjectionRef.current.getCode(), 'EPSG:4326'))]
      };
    });
  }, []);

  const clearCurrentPoints = useCallback(() => {
    // Clear preview line
    if (previewFeatureRef.current && drawingLayerRef.current) {
      const source = drawingLayerRef.current.getSource();
      if (source) {
        source.removeFeature(previewFeatureRef.current);
      }
      previewFeatureRef.current = null;
    }
    
    setDrawingState(prev => ({
      ...prev,
      currentPoint: null,
      previewLine: null,
      lastConfirmedPoint: null
    }));
  }, []);

  return {
    drawingState,
    startDrawing,
    stopDrawing,
    addPoint,
    updatePreviewLine,
    clearCurrentPoints
  };
};
