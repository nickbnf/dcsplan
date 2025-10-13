import React, { useState } from 'react';
import MapComponent from './Map';
import { Sidebar } from './Sidebar';
import type { FlightPlan } from '../types/flightPlan';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { useDrawing } from '../hooks/useDrawing';

const App: React.FC = () => {
  const [mouseCoordinate, setMouseCoordinate] = useState<{ lat: number; lon: number; raw_x: number; raw_y: number } | null>(null);
  const [flightPlan, setFlightPlan] = useState<FlightPlan>(flightPlanUtils.newFlightPlan());
  const { drawingState, startDrawing, stopDrawing, addPoint, updatePreviewLine, clearCurrentPoints } = useDrawing();

  const handleCoordinateChange = (coord: { lat: number; lon: number; raw_x: number; raw_y: number } | null) => {
    setMouseCoordinate(coord);
  };

  const handleFlightPlanUpdate = (updatedPlan: FlightPlan) => {
    console.log("handleFlightPlanUpdate")
    setFlightPlan(updatedPlan);
  };

  return (
    <div className="flex h-screen w-screen">
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
      <div className="flex-grow">
        <MapComponent 
          onCoordinateChange={handleCoordinateChange}
          flightPlan={flightPlan}
          onFlightPlanUpdate={handleFlightPlanUpdate}
          drawingState={drawingState}
          addPoint={addPoint}
          updatePreviewLine={updatePreviewLine}
          clearCurrentPoints={clearCurrentPoints}
        />
      </div>
    </div>
  );
};

export default App;
