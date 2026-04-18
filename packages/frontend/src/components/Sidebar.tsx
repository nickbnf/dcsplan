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
  flightPlan: FlightPlan;
  drawingState: DrawingState;
  projection?: any;
  navigationMode: string;
  onUndo?: () => void;
  onRedo?: () => void;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
  onStartDrawing: (map: any, existingFlightPlan?: any) => void;
  onStopDrawing: (map: any) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  flightPlan,
  drawingState,
  projection,
  navigationMode,
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
        projection={projection}
        navigationMode={navigationMode}
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
