import React, { useState } from 'react';
// @ts-expect-error: MapComponent import may be missing during linting
import MapComponent from './Map';

// Helper function to format decimal degrees to degrees/minutes
const formatDegreesMinutes = (decimalDegrees: number, isLatitude: boolean): string => {
  const absDegrees = Math.abs(decimalDegrees);
  const degrees = Math.floor(absDegrees);
  const minutes = Math.round((absDegrees - degrees) * 60 * 100) / 100; // Round to 2 decimal places
  
  const direction = isLatitude 
    ? (decimalDegrees >= 0 ? 'N' : 'S')
    : (decimalDegrees >= 0 ? 'E' : 'W');
  
  return `${degrees}°${minutes.toFixed(2)}'${direction}`;
};

const App: React.FC = () => {
  const [mouseCoordinate, setMouseCoordinate] = useState<{ lat: number; lon: number } | null>(null);

  const handleCoordinateChange = (coord: { lat: number; lon: number } | null) => {
    setMouseCoordinate(coord);
  };

  return (
    <div className="flex h-screen w-screen">
      <div className="w-[300px] bg-gray-800 text-white p-4 border-r border-gray-700">
        <h1 className="text-2xl font-bold mb-6">DCSPlan</h1>
        
        {/* Coordinate Display */}
        <div className="bg-gray-700 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Mouse Coordinates</h3>
          {mouseCoordinate ? (
            <div className="space-y-1">
              <div className="text-sm">
                <span className="text-gray-400">Lat:</span> {formatDegreesMinutes(mouseCoordinate.lat, true)}
              </div>
              <div className="text-sm">
                <span className="text-gray-400">Lon:</span> {formatDegreesMinutes(mouseCoordinate.lon, false)}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                <div>Decimal: {mouseCoordinate.lat.toFixed(6)}, {mouseCoordinate.lon.toFixed(6)}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400">Move mouse over map</div>
          )}
        </div>

        {/* Flight Planning Section Placeholder */}
        <div className="bg-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Flight Planning</h3>
          <div className="text-sm text-gray-400">Coming soon...</div>
        </div>
      </div>
      <div className="flex-grow">
        <MapComponent onCoordinateChange={handleCoordinateChange} />
      </div>
    </div>
  );
};

export default App;
