import React, { useState } from 'react';
import MapComponent from './Map';
import { Sidebar } from './Sidebar';

const App: React.FC = () => {
  const [mouseCoordinate, setMouseCoordinate] = useState<{ lat: number; lon: number; raw_x: number; raw_y: number } | null>(null);

  const handleCoordinateChange = (coord: { lat: number; lon: number; raw_x: number; raw_y: number } | null) => {
    setMouseCoordinate(coord);
  };

  return (
    <div className="flex h-screen w-screen">
      <Sidebar 
        mouseCoordinate={mouseCoordinate}
        onModeChange={(mode) => {
          console.log('Mode changed to:', mode);
          // Handle mode changes here
        }}
        onUndo={() => {
          console.log('Undo requested');
          // Implement undo functionality
        }}
        onRedo={() => {
          console.log('Redo requested');
          // Implement redo functionality
        }}
        onFlightPlanUpdate={(updatedPlan) => {
          console.log('Flight plan updated:', updatedPlan);
          // Handle flight plan updates here
        }}
      />
      <div className="flex-grow">
        <MapComponent onCoordinateChange={handleCoordinateChange} />
      </div>
    </div>
  );
};

export default App;
