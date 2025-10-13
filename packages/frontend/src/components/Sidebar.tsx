import React from 'react';
import { TitleZone } from './sidebar/TitleZone';
import { ButtonZone } from './sidebar/ButtonZone';
import { FlightPlanZone } from './sidebar/FlightPlanZone';
import type { FlightPlan } from '../types/flightPlan';
import type { DrawingState } from '../hooks/useDrawing';

interface SidebarProps {
  mouseCoordinate?: { lat: number; lon: number; raw_x: number; raw_y: number } | null;
  flightPlan: FlightPlan;
  drawingState: DrawingState;
  onUndo?: () => void;
  onRedo?: () => void;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
  onStartDrawing: (map: any, existingFlightPlan?: any) => void;
  onStopDrawing: (map: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  mouseCoordinate,
  flightPlan,
  drawingState,
  onUndo,
  onRedo,
  onFlightPlanUpdate,
  onStartDrawing,
  onStopDrawing
}) => {
  return (
    <div className="w-[400px] bg-white border-r border-gray-300 flex flex-col h-full">
      {/* Title Zone */}
      <TitleZone 
        mapName="Syria Theater"
        mouseCoordinates={mouseCoordinate ? {
          x: mouseCoordinate.raw_x,
          y: mouseCoordinate.raw_y,
          lat: mouseCoordinate.lat,
          lon: mouseCoordinate.lon
        } : undefined}
      />
      
      {/* Button Zone */}
      <ButtonZone 
        drawingState={drawingState}
        flightPlan={flightPlan}
        onUndo={onUndo}
        onRedo={onRedo}
        onStartDrawing={onStartDrawing}
        onStopDrawing={onStopDrawing}
      />
      
      {/* Flight Plan Zone */}
      <FlightPlanZone 
        flightPlan={flightPlan}
        onFlightPlanUpdate={onFlightPlanUpdate}
      />
    </div>
  );
};
