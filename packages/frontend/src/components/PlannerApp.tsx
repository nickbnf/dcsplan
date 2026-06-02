import React, { useState } from 'react';
import MapComponent from './Map';
import { Sidebar } from './Sidebar';
import { AboutModal } from './AboutModal';
import type { FlightPlan, PlanMarker, PictogramType } from '../types/flightPlan';
import { useDrawing } from '../hooks/useDrawing';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { useLibrary } from '../contexts/LibraryContext';
import { WaypointSelectionProvider } from '../contexts/WaypointSelectionContext';
import { ObjectSelectionProvider } from '../contexts/ObjectSelectionContext';

const PlannerApp: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate: setFlightPlan, fitToFlightPlanTrigger } = useFlightPlan();
  const { library } = useLibrary();
  const [mapNavInfo, setMapNavInfo] = useState<{ projection: any; navigationMode: string } | null>(null);
  const { drawingState, startDrawing, stopDrawing, startDragging, stopDragging, addPoint, confirmKeyboardWaypoint, updatePreviewLine } = useDrawing();
  const [activeTab, setActiveTab] = useState<'flightplan' | 'objects'>('flightplan');
  const [isAddMarkerMode, setIsAddMarkerMode] = useState(false);
  const [addMarkerType, setAddMarkerType] = useState<PictogramType>('sam_site');

  const handleFlightPlanUpdate = (updatedPlan: FlightPlan) => {
    setFlightPlan(updatedPlan);
  };

  const handleAddLibraryRef = (uuid: string) => {
    const alreadyAdded = (flightPlan.libraryRefs ?? []).some(r => r.uuid === uuid);
    if (alreadyAdded) return;
    handleFlightPlanUpdate({
      ...flightPlan,
      libraryRefs: [...(flightPlan.libraryRefs ?? []), { uuid }],
    });
    setActiveTab('objects');
  };

  const handleAddMarker = (lat: number, lon: number) => {
    const newMarker: PlanMarker = {
      id: crypto.randomUUID(),
      type: addMarkerType,
      lat,
      lon,
    };
    handleFlightPlanUpdate({
      ...flightPlan,
      markers: [...(flightPlan.markers ?? []), newMarker],
    });
  };

  return (
    <WaypointSelectionProvider>
    <ObjectSelectionProvider>
      <AboutModal />
      <div className="flex flex-1 w-full overflow-hidden">
        <Sidebar
          flightPlan={flightPlan}
          drawingState={drawingState}
          projection={mapNavInfo?.projection}
          navigationMode={mapNavInfo?.navigationMode || "geographic"}
          onUndo={() => {}}
          onRedo={() => {}}
          onFlightPlanUpdate={handleFlightPlanUpdate}
          onStartDrawing={startDrawing}
          onStopDrawing={stopDrawing}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAddMarkerMode={isAddMarkerMode}
          addMarkerType={addMarkerType}
          onAddModeToggle={() => setIsAddMarkerMode(prev => !prev)}
          onAddTypeChange={setAddMarkerType}
        />
        <div className="flex-grow h-full overflow-hidden">
          <MapComponent
            flightPlan={flightPlan}
            onFlightPlanUpdate={handleFlightPlanUpdate}
            drawingState={drawingState}
            onStartDragging={startDragging}
            onStopDragging={stopDragging}
            addPoint={addPoint}
            confirmKeyboardWaypoint={confirmKeyboardWaypoint}
            updatePreviewLine={updatePreviewLine}
            onMapNavInfoChange={setMapNavInfo}
            fitToFlightPlanTrigger={fitToFlightPlanTrigger}
            library={library}
            activeTab={activeTab}
            isAddMarkerMode={isAddMarkerMode}
            addMarkerType={addMarkerType}
            onAddLibraryRef={handleAddLibraryRef}
            onAddMarker={handleAddMarker}
            onObjectTabActivate={() => setActiveTab('objects')}
          />
        </div>
      </div>
    </ObjectSelectionProvider>
    </WaypointSelectionProvider>
  );
};

export default PlannerApp;
