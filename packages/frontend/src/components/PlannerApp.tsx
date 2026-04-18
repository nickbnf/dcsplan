import React, { useState } from 'react';
import MapComponent from './Map';
import { Sidebar } from './Sidebar';
import { AboutModal } from './AboutModal';
import type { FlightPlan } from '../types/flightPlan';
import { useDrawing } from '../hooks/useDrawing';
import { useFlightPlan } from '../contexts/FlightPlanContext';

const PlannerApp: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate: setFlightPlan } = useFlightPlan();
  const [mapNavInfo, setMapNavInfo] = useState<{ projection: any; navigationMode: string } | null>(null);
  const { drawingState, startDrawing, stopDrawing, startDragging, stopDragging, addPoint, updatePreviewLine } = useDrawing();

  const handleFlightPlanUpdate = (updatedPlan: FlightPlan) => {
    console.log("handleFlightPlanUpdate")
    setFlightPlan(updatedPlan);
  };

  return (
    <>
      <AboutModal />
      <div className="flex flex-1 w-full overflow-hidden">
        <Sidebar
          flightPlan={flightPlan}
          drawingState={drawingState}
          projection={mapNavInfo?.projection}
          navigationMode={mapNavInfo?.navigationMode || "geographic"}
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
            flightPlan={flightPlan}
            onFlightPlanUpdate={handleFlightPlanUpdate}
            drawingState={drawingState}
            onStartDragging={startDragging}
            onStopDragging={stopDragging}
            addPoint={addPoint}
            updatePreviewLine={updatePreviewLine}
            onMapNavInfoChange={setMapNavInfo}
          />
        </div>
      </div>
    </>
  );
};

export default PlannerApp;
