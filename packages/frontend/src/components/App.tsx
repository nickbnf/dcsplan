import React, { useState } from 'react';
import MapComponent from './Map';
import { Sidebar } from './Sidebar';
import type { FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { useDrawing } from '../hooks/useDrawing';
import { usePersistedFlightPlan } from '../hooks/usePersistedFlightPlan';

const App: React.FC = () => {
  const [mouseCoordinate, setMouseCoordinate] = useState<{ lat: number; lon: number; raw_x: number; raw_y: number } | null>(null);
  // Start with sample waypoints for testing waypoint editing (used when no saved data exists)
  const [flightPlan, setFlightPlan] = usePersistedFlightPlan(() => {
    let plan = flightPlanUtils.newFlightPlan();
    return plan;
  });
  const { drawingState, startDrawing, stopDrawing, startDragging, stopDragging, addPoint, updatePreviewLine } = useDrawing();

  const handleCoordinateChange = (coord: { lat: number; lon: number; raw_x: number; raw_y: number } | null) => {
    setMouseCoordinate(coord);
  };

  const handleFlightPlanUpdate = (updatedPlan: FlightPlan) => {
    console.log("handleFlightPlanUpdate")
    setFlightPlan(updatedPlan);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar 
        mouseCoordinate={mouseCoordinate}
        flightPlan={flightPlan}
        drawingState={drawingState}
        onUndo={() => {
          console.log('Undo requested');
          // Implement undo functionality
        }}
        onRedo={() => {
          console.log('Redo requested');
          // Implement redo functionality
        }}
        onFlightPlanUpdate={handleFlightPlanUpdate}
        onStartDrawing={startDrawing}
        onStopDrawing={stopDrawing}
      />
      <div className="flex-grow h-full overflow-hidden">
        <MapComponent 
          onCoordinateChange={handleCoordinateChange}
          flightPlan={flightPlan}
          onFlightPlanUpdate={handleFlightPlanUpdate}
          drawingState={drawingState}
          onStartDragging={startDragging}
          onStopDragging={stopDragging}
          addPoint={addPoint}
          updatePreviewLine={updatePreviewLine}
        />
      </div>
    </div>
  );
};

export default App;
