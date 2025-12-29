import React from 'react';
import { Link } from 'react-router-dom';
import * as Separator from '@radix-ui/react-separator';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { TheatreMetadata } from '../../hooks/useTheatres';

interface TitleZoneProps {
  currentTheatreId: string;
  availableTheatres: TheatreMetadata[];
  isLoadingTheatres: boolean;
  onTheatreChange: (theatreId: string) => void;
  mouseCoordinates?: { x: number; y: number; lat?: number; lon?: number } | null;
}

export const TitleZone: React.FC<TitleZoneProps> = ({ 
  currentTheatreId,
  availableTheatres,
  isLoadingTheatres,
  onTheatreChange,
  mouseCoordinates 
}) => {
  const currentTheatre = availableTheatres.find(t => t.id === currentTheatreId);
  const theatreDisplayName = currentTheatre ? currentTheatre.name : "Select Theatre";

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
      
      {/* Map Name with Dropdown */}
      <div className="space-y-1 text-sm text-gray-600">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button 
              className="flex justify-between items-center w-full cursor-pointer hover:bg-gray-200 rounded px-2 py-1 -mx-2 transition-colors group outline-none"
              disabled={isLoadingTheatres}
            >
              <span className="font-aero-label">
                {isLoadingTheatres ? 'Loading...' : `${theatreDisplayName} Theatre`}
              </span>
              {!isLoadingTheatres && (
                <span className="text-[10px] text-gray-400 group-hover:text-gray-600 ml-2 transition-colors">
                  ▼
                </span>
              )}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content 
              className="bg-white rounded-md p-1 shadow-lg border border-gray-200 min-w-[200px] z-50 animate-in fade-in zoom-in duration-75"
              sideOffset={5}
              align="start"
            >
              {availableTheatres.map((theatre) => (
                <DropdownMenu.Item
                  key={theatre.id}
                  className={`
                    flex items-center px-3 py-2 text-sm font-aero-label outline-none cursor-pointer rounded transition-colors
                    ${theatre.id === currentTheatreId 
                      ? 'bg-avio-panel text-avio-primary font-semibold' 
                      : 'text-gray-700 hover:bg-gray-100'}
                  `}
                  onSelect={() => onTheatreChange(theatre.id)}
                >
                  {theatre.name}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
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