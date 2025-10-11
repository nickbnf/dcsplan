import { useRef, useCallback, useState } from 'react';
import { transform } from 'ol/proj';
import { LineString } from 'ol/geom';
import { Feature } from 'ol';
import { Stroke, Style } from 'ol/style';
import type { FlightPlanTurnPoint } from '../types/flightPlan';

export interface DrawingState {
  isDrawing: boolean;
  currentPoints: FlightPlanTurnPoint[];
  previewLine: FlightPlanTurnPoint[] | null;
}

export const useDrawing = () => {
  const previewFeatureRef = useRef<Feature<LineString> | null>(null);
  const drawingLayerRef = useRef<any>(null);
  const mapProjectionRef = useRef<any>(null);
  
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    currentPoints: [],
    previewLine: null
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
    const initialPoints = existingFlightPlan && existingFlightPlan.points.length > 0 
      ? [existingFlightPlan.points[existingFlightPlan.points.length - 1]]
      : [];
    
    console.log('Drawing mode started', initialPoints.length > 0 ? 'from existing flight plan' : 'from scratch');
    setDrawingState({
      isDrawing: true,
      currentPoints: initialPoints,
      previewLine: null
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
      currentPoints: prev.currentPoints, // Keep the points for conversion
      previewLine: null
    }));
    
    console.log('Drawing mode stopped');
  }, []);

  const addPoint = useCallback((coordinate: [number, number]) => {
    if (!mapProjectionRef.current) return;

    const [lon, lat] = transform(coordinate, mapProjectionRef.current.getCode(), 'EPSG:4326');
    const newPoint: FlightPlanTurnPoint = { lat, lon };
    
    setDrawingState(prev => ({
      ...prev,
      currentPoints: [...prev.currentPoints, newPoint]
    }));
    
    console.log('Added point:', newPoint);
  }, []);

  const updatePreviewLine = useCallback((coordinate: [number, number]) => {
    if (!mapProjectionRef.current || !drawingLayerRef.current) return;

    const [lon, lat] = transform(coordinate, mapProjectionRef.current.getCode(), 'EPSG:4326');
    const previewPoint: FlightPlanTurnPoint = { lat, lon };
    
    setDrawingState(prev => {
      if (prev.currentPoints.length === 0) {
        return prev; // No preview if no points yet
      }
      
      const lastPoint = prev.currentPoints[prev.currentPoints.length - 1];
      const previewLine = [lastPoint, previewPoint];
      
      // Update preview line on map
      if (previewFeatureRef.current) {
        const source = drawingLayerRef.current.getSource();
        if (source) {
          source.removeFeature(previewFeatureRef.current);
        }
      }
      
      // Create new preview line feature
      const lastPointCoord = transform([lastPoint.lon, lastPoint.lat], 'EPSG:4326', mapProjectionRef.current.getCode());
      const previewCoord = transform([previewPoint.lon, previewPoint.lat], 'EPSG:4326', mapProjectionRef.current.getCode());
      
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
        previewLine
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
      currentPoints: [],
      previewLine: null
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
