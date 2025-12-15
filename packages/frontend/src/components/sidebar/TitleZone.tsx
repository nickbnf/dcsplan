import React from 'react';
import { Link } from 'react-router-dom';
import * as Separator from '@radix-ui/react-separator';

interface TitleZoneProps {
  mapName: string;
  mouseCoordinates?: { x: number; y: number; lat?: number; lon?: number } | null;
}

export const TitleZone: React.FC<TitleZoneProps> = ({ 
  mapName, 
  mouseCoordinates 
}) => {
  const lat_deg = Math.trunc(mouseCoordinates?.lat ?? 0);
  const lat_minutes = ((mouseCoordinates?.lat ?? 0) - lat_deg) * 60;
  const lon_deg = Math.trunc(mouseCoordinates?.lon ?? 0);
  const lon_minutes = ((mouseCoordinates?.lon ?? 0) - lon_deg) * 60;

  return (
    <div className="p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-aero-label text-gray-900">
          DCS Tactical Planner
        </h1>
        <Link
          to="/about"
          className="text-xs text-gray-600 hover:text-gray-900 underline font-aero-label"
          title="About DCSPlan"
        >
          About
        </Link>
      </div>
      
      {/* Map Name */}
      <div className="space-y-1 text-sm text-gray-600">
        <div className="flex justify-between">
          {mapName}
        </div>
      </div>
      
      {/* Mouse Coordinates */}
      {mouseCoordinates && mouseCoordinates.lat && mouseCoordinates.lon ? (
        <>
          <Separator.Root className="my-3 bg-gray-300 h-px" />
          <div className="text-sm text-gray-600">
            <div className="font-aero-label text-gray-700 mb-2">Mouse Position</div>
            <div className="flex">
              {/* Left Column - X and Y */}
              <div className="flex-1 space-y-1">
                <div className="flex justify-between">
                  <span className="font-aero-label">X:</span>
                  <span className="font-aero-mono">{mouseCoordinates.x.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-aero-label">Y:</span>
                  <span className="font-aero-mono">{mouseCoordinates.y.toFixed(0)}</span>
                </div>
              </div>
              
              {/* Vertical Separator */}
              <div className="w-px bg-gray-300 mx-2 self-stretch"></div>
              
              {/* Right Column - Lat and Lon */}
              <div className="flex-1 space-y-1">
                <div className="flex justify-between">
                  <span className="font-aero-label">Lat:</span>
                  <span className="font-aero-mono">{lat_deg}°{lat_minutes.toFixed(2)}'</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-aero-label">Lon:</span>
                  <span className="font-aero-mono">{lon_deg}°{lon_minutes.toFixed(2)}'</span>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <Separator.Root className="my-3 bg-gray-300 h-px" />
          <div className="text-sm text-gray-600">
            <div className="font-aero-label text-gray-700 mb-1">Mouse Position</div>
            <div className="text-gray-500 font-aero-label">Move mouse over map</div>
          </div>
        </>
      )}
    </div>
  );
};