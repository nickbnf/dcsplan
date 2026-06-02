import React, { useState } from 'react';
import { TitleZone } from './sidebar/TitleZone';
import { ButtonZone } from './sidebar/ButtonZone';
import { FlightPlanZone } from './sidebar/FlightPlanZone';
import { ObjectsZone } from './sidebar/ObjectsZone';
import { ChangeTheatreDialog } from './sidebar/ChangeTheatreDialog';
import { ImportFlightPlanDialog } from './sidebar/ImportFlightPlanDialog';
import type { FlightPlan, PictogramType } from '../types/flightPlan';
import type { DrawingState } from '../hooks/useDrawing';
import { useTheatres } from '../hooks/useTheatres';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { flightPlanUtils } from '../utils/flightPlanUtils';
import { useLibrary } from '../contexts/LibraryContext';
import { mergeLibraryEntries } from '../utils/libraryStorage';

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
  activeTab: 'flightplan' | 'objects';
  onTabChange: (tab: 'flightplan' | 'objects') => void;
  isAddMarkerMode: boolean;
  addMarkerType: PictogramType;
  onAddModeToggle: () => void;
  onAddTypeChange: (type: PictogramType) => void;
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
  onStopDrawing,
  activeTab,
  onTabChange,
  isAddMarkerMode,
  addMarkerType,
  onAddModeToggle,
  onAddTypeChange,
}) => {
  const { theatres, isLoading: isLoadingTheatres } = useTheatres();
  const { library, clearAll: clearLibrary, setLibrary } = useLibrary();
  const { requestFitToFlightPlan } = useFlightPlan();
  const [pendingTheatreId, setPendingTheatreId] = useState<string | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleTheatreSelect = (theatreId: string) => {
    if (theatreId === flightPlan.theatre) return;

    if (flightPlan.points.length > 0 || library.length > 0) {
      setPendingTheatreId(theatreId);
      setIsConfirmDialogOpen(true);
    } else {
      const updatedPlan = flightPlanUtils.newFlightPlan(theatreId);
      onFlightPlanUpdate(updatedPlan);
    }
  };

  const handleConfirmTheatreChange = () => {
    if (pendingTheatreId) {
      clearLibrary();
      const updatedPlan = flightPlanUtils.newFlightPlan(pendingTheatreId);
      onFlightPlanUpdate(updatedPlan);
      setPendingTheatreId(null);
    }
  };

  const pendingTheatreName = theatres.find(t => t.id === pendingTheatreId)?.name || "";

  return (
    <div className="w-[450px] bg-white border-r border-gray-300 flex flex-col h-full">
      <TitleZone
        currentTheatreId={flightPlan.theatre}
        availableTheatres={theatres}
        isLoadingTheatres={isLoadingTheatres}
        onTheatreChange={handleTheatreSelect}
      />

      <ButtonZone
        flightPlan={flightPlan}
        onUndo={onUndo}
        onRedo={onRedo}
        onFlightPlanUpdate={onFlightPlanUpdate}
        isSettingsOpen={isSettingsOpen}
        onSettingsToggle={() => setIsSettingsOpen(o => !o)}
        importTrigger={
          <ImportFlightPlanDialog
            onImport={(importedFlightPlan) => {
              onFlightPlanUpdate(importedFlightPlan);
              requestFitToFlightPlan();
            }}
            onLibrarySnapshot={(snapshot) => {
              const result = mergeLibraryEntries(library, snapshot);
              setLibrary(result.merged);
            }}
            currentLibrary={library}
          />
        }
        onExport={() => flightPlanUtils.downloadFlightPlan(flightPlan, library)}
      />

      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 bg-white shrink-0">
        <button
          onClick={() => onTabChange('flightplan')}
          className={`flex-1 py-2 text-xs font-aero-label transition-colors border-b-2 ${
            activeTab === 'flightplan'
              ? 'border-avio-primary text-avio-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Flight Plan
        </button>
        <button
          onClick={() => onTabChange('objects')}
          className={`flex-1 py-2 text-xs font-aero-label transition-colors border-b-2 ${
            activeTab === 'objects'
              ? 'border-avio-primary text-avio-primary'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Objects
          {((flightPlan.libraryRefs?.length ?? 0) + (flightPlan.markers?.length ?? 0)) > 0 && (
            <span className="ml-1 text-xs text-gray-400">
              ({(flightPlan.libraryRefs?.length ?? 0) + (flightPlan.markers?.length ?? 0)})
            </span>
          )}
        </button>
      </div>

      {/* Tab content — both mounted for state preservation, hidden via CSS */}
      <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${activeTab === 'flightplan' ? '' : 'hidden'}`}>
        <FlightPlanZone
          flightPlan={flightPlan}
          onFlightPlanUpdate={onFlightPlanUpdate}
          projection={projection}
          navigationMode={navigationMode}
          drawingState={drawingState}
          onStartDrawing={onStartDrawing}
          onStopDrawing={onStopDrawing}
        />
      </div>
      <div className={`flex-1 min-h-0 overflow-hidden flex flex-col ${activeTab === 'objects' ? '' : 'hidden'}`}>
        <ObjectsZone
          flightPlan={flightPlan}
          onFlightPlanUpdate={onFlightPlanUpdate}
          isAddMode={isAddMarkerMode}
          addType={addMarkerType}
          onAddModeToggle={onAddModeToggle}
          onAddTypeChange={onAddTypeChange}
        />
      </div>

      <ChangeTheatreDialog
        isOpen={isConfirmDialogOpen}
        onOpenChange={setIsConfirmDialogOpen}
        onConfirm={handleConfirmTheatreChange}
        theatreName={pendingTheatreName}
        hasLibraryEntries={library.length > 0}
      />
    </div>
  );
};
