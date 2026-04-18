import React from 'react';
import { formatCoordinate } from '../utils/coordinateUtils';

interface MapCoordinatesOverlayProps {
  coordinate: { lat: number; lon: number; raw_x: number; raw_y: number } | null;
}

export const MapCoordinatesOverlay: React.FC<MapCoordinatesOverlayProps> = ({ coordinate }) => {
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
