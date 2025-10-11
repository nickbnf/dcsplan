import { useRef, useCallback, useState } from 'react';
import { Draw } from 'ol/interaction';
import { LineString } from 'ol/geom';
import { Feature } from 'ol';
import { transform } from 'ol/proj';
import type { FlightPlanTurnPoint } from '../types/flightPlan';

export interface DrawingState {
  isDrawing: boolean;
  currentLine: FlightPlanTurnPoint[] | null;
}

export const useDrawing = () => {
  const drawInteractionRef = useRef<Draw | null>(null);
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    currentLine: null
  });

  const startDrawing = useCallback((map: any) => {
    // Clean up existing interaction
    if (drawInteractionRef.current) {
      map.removeInteraction(drawInteractionRef.current);
    }

    // Find the drawing layer
    const drawingLayer = map.getLayers().getArray().find((layer: any) => 
      layer.get('name') === 'drawing'
    );
    
    if (!drawingLayer) {
      console.error('Drawing layer not found');
      return;
    }

    console.log('Found drawing layer:', drawingLayer);

    // Get the map projection
    const mapProjection = map.getView().getProjection();
    console.log('Map projection:', mapProjection.getCode());

    // Create new draw interaction for line strings
    const draw = new Draw({
      source: drawingLayer.getSource(),
      type: 'LineString',
      maxPoints: 4, // Limit to 2 points for line drawing
      minPoints: 2
    });

    console.log('Created draw interaction:', draw);

    // Handle drawing start
    draw.on('drawstart', () => {
      console.log('Drawing started');
      setDrawingState(prev => ({ isDrawing: true, currentLine: [] }));
    });

    // Handle drawing end
    draw.on('drawend', (event) => {
      console.log('Drawing ended');
      const feature = event.feature as Feature<LineString>;
      const geometry = feature.getGeometry();
      
      if (geometry) {
        const coordinates = geometry.getCoordinates();
        console.log('Raw coordinates:', coordinates);
        
        // Transform coordinates from map projection to geographic
        const linePoints: FlightPlanTurnPoint[] = coordinates.map(coord => {
          const [lon, lat] = transform(coord, mapProjection.getCode(), 'EPSG:4326');
          return { lat, lon };
        });

        console.log('Transformed coordinates:', linePoints);

        setDrawingState(prev => ({ 
          ...prev, 
          currentLine: linePoints 
        }));

        // Remove the temporary feature
        const source = drawingLayer.getSource();
        if (source) {
          source.removeFeature(feature);
        }
      }
    });

    // Handle drawing abort
    draw.on('drawabort', () => {
      console.log('Drawing aborted');
      setDrawingState(prev => ({ 
        ...prev, 
        currentLine: null 
      }));
    });

    drawInteractionRef.current = draw;
    map.addInteraction(draw);
    
    console.log('Added draw interaction to map');
    return draw;
  }, []);

  const stopDrawing = useCallback((map: any) => {
    if (drawInteractionRef.current) {
      map.removeInteraction(drawInteractionRef.current);
      drawInteractionRef.current = null;
    }
    setDrawingState({ isDrawing: false, currentLine: null });
  }, []);

  const clearCurrentLine = useCallback(() => {
    setDrawingState(prev => ({ ...prev, currentLine: null }));
  }, []);

  return {
    drawingState,
    startDrawing,
    stopDrawing,
    clearCurrentLine
  };
};
