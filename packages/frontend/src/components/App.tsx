import React, { useState } from 'react';
import MapComponent from './Map';
import { Sidebar } from './Sidebar';
import type { FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { useDrawing } from '../hooks/useDrawing';

const App: React.FC = () => {
  const [mouseCoordinate, setMouseCoordinate] = useState<{ lat: number; lon: number; raw_x: number; raw_y: number } | null>(null);
  // Start with sample waypoints for testing waypoint editing
  const [flightPlan, setFlightPlan] = useState<FlightPlan>(() => {
    let plan = flightPlanUtils.newFlightPlan();
    // Add some sample waypoints in the Syria region
    plan = flightPlanUtils.addTurnPoint(plan, 33.5, 36.0); // Damascus area
    plan = flightPlanUtils.addTurnPoint(plan, 34.0, 36.5); // North of Damascus
    plan = flightPlanUtils.addTurnPoint(plan, 34.5, 37.0); // Further north
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
