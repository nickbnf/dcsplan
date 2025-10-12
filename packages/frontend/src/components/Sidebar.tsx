import React from 'react';
import { TitleZone } from './sidebar/TitleZone';
import { ButtonZone } from './sidebar/ButtonZone';
import { FlightPlanZone } from './sidebar/FlightPlanZone';

interface SidebarProps {
  mouseCoordinate?: { lat: number; lon: number; raw_x: number; raw_y: number } | null;
  flightPlan?: any; // Will be typed properly later
  onModeChange?: (mode: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onFlightPlanUpdate?: (flightPlan: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mouseCoordinate,
  flightPlan,
  onModeChange,
  onUndo,
  onRedo,
  onFlightPlanUpdate
}) => {
  return (
    <div className="w-[300px] bg-white border-r border-gray-300 flex flex-col h-full">
      {/* Title Zone */}
      <TitleZone 
        mapName="DCSPlan"
        mouseCoordinates={mouseCoordinate ? {
          x: mouseCoordinate.raw_x,
          y: mouseCoordinate.raw_y,
          lat: mouseCoordinate.lat,
          lon: mouseCoordinate.lon
        } : undefined}
      />
      
      {/* Button Zone */}
      <ButtonZone 
        onModeChange={onModeChange}
        onUndo={onUndo}
        onRedo={onRedo}
      />
      
      {/* Flight Plan Zone */}
      <FlightPlanZone 
        flightPlan={flightPlan}
        onFlightPlanUpdate={onFlightPlanUpdate}
      />
    </div>
  );
};
