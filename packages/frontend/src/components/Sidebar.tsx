import React, { useState } from 'react';
import { TitleZone } from './sidebar/TitleZone';
import { ButtonZone } from './sidebar/ButtonZone';
import { FlightPlanZone } from './sidebar/FlightPlanZone';
import { ChangeTheatreDialog } from './sidebar/ChangeTheatreDialog';
import type { FlightPlan } from '../types/flightPlan';
import type { DrawingState } from '../hooks/useDrawing';
import { useTheatres } from '../hooks/useTheatres';
import { flightPlanUtils } from '../utils/flightPlanUtils';

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
  const { theatres, isLoading: isLoadingTheatres } = useTheatres();
  const [pendingTheatreId, setPendingTheatreId] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  const handleTheatreSelect = (theatreId: string) => {
    if (theatreId === flightPlan.theatre) return;
    
    // If flight plan has points, ask for confirmation
    if (flightPlan.points.length > 0) {
      setPendingTheatreId(theatreId);
      setIsConfirmDialogOpen(true);
    } else {
      // Otherwise change immediately
      const updatedPlan = flightPlanUtils.newFlightPlan(theatreId);
      onFlightPlanUpdate(updatedPlan);
    }
  };

  const handleConfirmTheatreChange = () => {
    if (pendingTheatreId) {
      const updatedPlan = flightPlanUtils.newFlightPlan(pendingTheatreId);
      onFlightPlanUpdate(updatedPlan);
      setPendingTheatreId(null);
    }
  };

  const pendingTheatreName = theatres.find(t => t.id === pendingTheatreId)?.name || "";

  return (
    <div className="w-[400px] bg-white border-r border-gray-300 flex flex-col h-full overflow-y-auto">
      {/* Title Zone */}
      <TitleZone 
        currentTheatreId={flightPlan.theatre}
        availableTheatres={theatres}
        isLoadingTheatres={isLoadingTheatres}
        onTheatreChange={handleTheatreSelect}
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
        onFlightPlanUpdate={onFlightPlanUpdate}
      />
      
      {/* Flight Plan Zone */}
      <FlightPlanZone 
        flightPlan={flightPlan}
        onFlightPlanUpdate={onFlightPlanUpdate}
      />

      <ChangeTheatreDialog 
        isOpen={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
        onConfirm={handleConfirmTheatreChange}
        theatreName={pendingTheatreName}
      />
    </div>
  );
};
