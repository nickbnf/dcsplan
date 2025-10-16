import { useRef, useCallback, useState } from 'react';
import { transform } from 'ol/proj';
import { LineString, Point } from 'ol/geom';
import { Feature } from 'ol';
import { Circle, Fill, Stroke, Style } from 'ol/style';

export type DrawingStateType = 'NO_DRAWING' | 'NEW_POINT' | 'DRAG_POINT';

export interface DrawingState {
  isDrawing: DrawingStateType;
  currentPoint: Point | null;
  previewLine: Point[] | null;
  lastConfirmedPoint: Point | null;
  draggedWaypointIndex: number | null;
  prevWpPos: [number, number] | null;
  nextWpPos: [number, number] | null;
}

export const useDrawing = () => {
  const previewFeatureRef = useRef<Feature<LineString>[] | null>(null);
  const previewWptFeatureRef = useRef<Feature<Point> | null>(null);
  const drawingLayerRef = useRef<any>(null);
  const mapProjectionRef = useRef<any>(null);

  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: 'NO_DRAWING',
    currentPoint: null,
    previewLine: null,
    lastConfirmedPoint: null,
    draggedWaypointIndex: null,
    prevWpPos: null,
    nextWpPos: null,
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
      isDrawing: 'NEW_POINT',
      currentPoint: initialPoint,
      previewLine: null,
      lastConfirmedPoint: initialPoint,
      draggedWaypointIndex: null,
      prevWpPos: null,
      nextWpPos: null,
    });
  }, []);

  const stopDrawing = useCallback((_map: any) => {
    // Clear preview line
    if (previewFeatureRef.current && drawingLayerRef.current) {
      const source = drawingLayerRef.current.getSource();
      if (source) {
        source.removeFeatures(previewFeatureRef.current);
      }
      previewFeatureRef.current = null;
    }
    
    setDrawingState(prev => ({
      isDrawing: 'NO_DRAWING',
      currentPoint: prev.currentPoint, // Keep the points for conversion
      previewLine: null,
      lastConfirmedPoint: prev.lastConfirmedPoint,
      draggedWaypointIndex: null,
      prevWpPos: null,
      nextWpPos: null,
    }));
    
  }, []);

  const startDragging = useCallback((map: any, waypointIndex: number, prevWpPos: [number, number] | null, nextWpPos: [number, number] | null) => {
    console.log('startDragging', waypointIndex);
  
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

    setDrawingState(prev => ({
      ...prev,
      isDrawing: 'DRAG_POINT',
      draggedWaypointIndex: waypointIndex,
      prevWpPos: prevWpPos,
      nextWpPos: nextWpPos
    }));
  }, []);

  const stopDragging = useCallback(() => {
    console.log('stopDragging');

    // Clear preview line
    if (previewFeatureRef.current && drawingLayerRef.current) {
      const source = drawingLayerRef.current.getSource();
      if (source) {
        source.removeFeatures(previewFeatureRef.current);
      }
      previewFeatureRef.current = null;
    }

    setDrawingState(prev => ({
      ...prev,
      isDrawing: 'NO_DRAWING',
      draggedWaypointIndex: null
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
    console.log('updatePreviewLine', coordinate, drawingState);
    if (!mapProjectionRef.current || !drawingLayerRef.current) {
      console.log('updatePreviewLine: no map or drawing layer');
      return;
    }

    // Update preview line on map
    if (previewFeatureRef.current) {
      const source = drawingLayerRef.current.getSource();
      if (source) {
        source.removeFeatures(previewFeatureRef.current);
      }
    }

    if (previewWptFeatureRef.current) {
      const source = drawingLayerRef.current.getSource();
      if (source) {
        source.removeFeature(previewWptFeatureRef.current);
      }
    }

    const previewCoord = coordinate;

    const previewWptFeature = new Feature({
      geometry: new Point(previewCoord),
      type: 'preview'
    });
    previewWptFeature.setStyle([
      // Outer circle
      new Style({
        image: new Circle({
          radius: 12,
          stroke: new Stroke({ color: '#0066CC', width: 2 })
        })
      }),
      // Center dot
      new Style({
        image: new Circle({
          radius: 1,
          fill: new Fill({ color: '#0066CC' })
        })
      })
    ]);

    const source = drawingLayerRef.current.getSource();
    console.log('source', source, drawingState.isDrawing);
    if (source) {
      console.log('addFeature', drawingState.isDrawing);
      if (drawingState.isDrawing === 'NEW_POINT') {
        // Use lastConfirmedPoint if available, otherwise use currentPoint
        const lastPoint = drawingState.lastConfirmedPoint || drawingState.currentPoint;

        if (lastPoint !== null) {
          const lastPointCoord = transform(lastPoint.getCoordinates() || [0, 0], 'EPSG:4326', mapProjectionRef.current.getCode());
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

          source.addFeature(previewFeature)
          if (!previewFeatureRef.current) {
            previewFeatureRef.current = [];
          }
          previewFeatureRef.current.push(previewFeature)
        }
      } else if (drawingState.isDrawing === 'DRAG_POINT') {
        if (drawingState.prevWpPos) {
          const prevWpPosCoord = transform(drawingState.prevWpPos, 'EPSG:4326', mapProjectionRef.current.getCode());
          const previewFeature = new Feature({
            geometry: new LineString([prevWpPosCoord, coordinate]),
            type: 'preview'
          });

          previewFeature.setStyle(new Style({
            stroke: new Stroke({
              color: 'orange',
              width: 2,
              lineDash: [10, 5]
            })
          }));

          source.addFeature(previewFeature)
          if (!previewFeatureRef.current) {
            previewFeatureRef.current = [];
          }
          previewFeatureRef.current.push(previewFeature)
        }
        if (drawingState.nextWpPos) {
          const nextWpPosCoord = transform(drawingState.nextWpPos, 'EPSG:4326', mapProjectionRef.current.getCode());
          const previewFeature = new Feature({
            geometry: new LineString([nextWpPosCoord, coordinate]),
            type: 'preview'
          });
          
          previewFeature.setStyle(new Style({
            stroke: new Stroke({
              color: 'orange',
              width: 2,
              lineDash: [10, 5]
            })
          }));

          source.addFeature(previewFeature)
          if (!previewFeatureRef.current) {
            previewFeatureRef.current = [];
          }
          previewFeatureRef.current.push(previewFeature)
        }
      }
      source.addFeature(previewWptFeature)
      previewWptFeatureRef.current = previewWptFeature
    }

    /*
    setDrawingState(prev => {
      return {
        ...prev,
        // previewLine: [lastPoint, new Point(transform(coordinate, mapProjectionRef.current.getCode(), 'EPSG:4326'))]
      };
    });
    */
  }, [drawingState]);

  return {
    drawingState,
    startDrawing,
    stopDrawing,
    startDragging,
    stopDragging,
    addPoint,
    updatePreviewLine,
  };
};
