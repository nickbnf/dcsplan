import React from 'react';
import { formatCoordinate } from '../utils/coordinateUtils';

interface MapCoordinatesOverlayProps {
  coordinate: { lat: number; lon: number; raw_x: number; raw_y: number } | null;
  entryTemplate?: string | null;
  entryHasError?: boolean;
}

export const MapCoordinatesOverlay: React.FC<MapCoordinatesOverlayProps> = ({
  coordinate,
  entryTemplate,
  entryHasError,
}) => {
  if (entryTemplate) {
    // § is inserted by formatTemplate at the cursor position
    const parts = entryTemplate.split('§');
    return (
      <div className="absolute bottom-4 left-4 z-10 pointer-events-none select-none flex flex-col gap-1">
        <div className={`rounded-md px-3 py-2 text-white shadow-lg backdrop-blur-sm ${entryHasError ? 'bg-red-700/80' : 'bg-black/60'}`}>
          <span className="font-aero-mono tracking-wider">
            {parts[0]}
            {parts.length > 1 && <span className="animate-pulse">|</span>}
            {parts[1]}
          </span>
        </div>
      </div>
    );
  }

  if (!coordinate) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 pointer-events-none select-none rounded-md bg-black/60 backdrop-blur-sm px-3 py-2 text-white shadow-lg">
      <div className="flex gap-4">
        <span className="font-aero-mono">{formatCoordinate(coordinate.lat, 'lat')}</span>
        <span className="font-aero-mono">{formatCoordinate(coordinate.lon, 'lon')}</span>
      </div>
    </div>
  );
};
