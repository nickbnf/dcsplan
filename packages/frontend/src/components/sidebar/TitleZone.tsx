import React from 'react';
import * as Separator from '@radix-ui/react-separator';

interface TitleZoneProps {
  mapName: string;
  mouseCoordinates?: { x: number; y: number; lat?: number; lon?: number } | null;
}

export const TitleZone: React.FC<TitleZoneProps> = ({ 
  mapName, 
  mouseCoordinates 
}) => {
  return (
    <div className="p-4 bg-gray-50">
      {/* Map Name */}
      <h1 className="text-lg font-semibold text-gray-900 mb-2">
        {mapName}
      </h1>
      
      {/* Basic Data */}
      <div className="space-y-1 text-sm text-gray-600">
        <div className="flex justify-between">
          <span>Scale:</span>
          <span>1:50,000</span>
        </div>
        <div className="flex justify-between">
          <span>Projection:</span>
          <span>UTM</span>
        </div>
      </div>
      
      {/* Mouse Coordinates */}
      {mouseCoordinates && mouseCoordinates.lat && mouseCoordinates.lon ? (
        <>
          <Separator.Root className="my-3 bg-gray-300 h-px" />
          <div className="text-sm text-gray-600">
            <div className="font-medium text-gray-700 mb-1">Mouse Position</div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span>X:</span>
                <span className="font-mono">{mouseCoordinates.x.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Y:</span>
                <span className="font-mono">{mouseCoordinates.y.toFixed(0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Lat:</span>
                <span className="font-mono">{mouseCoordinates.lat.toFixed(6)}</span>
              </div>
              <div className="flex justify-between">
                <span>Lon:</span>
                <span className="font-mono">{mouseCoordinates.lon.toFixed(6)}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <Separator.Root className="my-3 bg-gray-300 h-px" />
          <div className="text-sm text-gray-600">
            <div className="font-medium text-gray-700 mb-1">Mouse Position</div>
            <div className="text-gray-500">Move mouse over map</div>
          </div>
        </>
      )}
    </div>
  );
};