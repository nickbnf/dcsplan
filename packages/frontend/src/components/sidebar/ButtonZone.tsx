import React, { useState } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as Separator from '@radix-ui/react-separator';
import type { FlightPlan } from '../../types/flightPlan';
import type { DrawingState } from '../../hooks/useDrawing';

interface ButtonZoneProps {
  drawingState: DrawingState;
  flightPlan: FlightPlan;
  onUndo?: () => void;
  onRedo?: () => void;
  onStartDrawing: (map: any, existingFlightPlan?: any) => void;
  onStopDrawing: (map: any) => void;
}

export const ButtonZone: React.FC<ButtonZoneProps> = ({
  drawingState,
  flightPlan,
  onUndo,
  onRedo,
  onStartDrawing,
  onStopDrawing
}) => {
  const [gridEnabled, setGridEnabled] = useState(false);
  const [measureEnabled, setMeasureEnabled] = useState(false);

  const handleAddWPTsClick = () => {
    // Get the map instance from the window (we'll need to expose it from Map component)
    const mapInstance = (window as any).mapInstance;
    if (!mapInstance) {
      console.error('Map instance not found');
      return;
    }

    if (drawingState.isDrawing) {
      onStopDrawing(mapInstance);
    } else {
      onStartDrawing(mapInstance, flightPlan);
    }
  };

  return (
    <div className="p-4 bg-white">
      {/*
      Mode Controls
      <div className="mb-4">
        <h3 className="text-sm font-aero-label text-gray-700 mb-2">Drawing Mode</h3>
        <div className="flex space-x-2">
          <Toggle.Root
            pressed={activeMode === 'pan'}
            onPressedChange={() => handleModeChange('pan')}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 data-[state=on]:bg-gray-200 data-[state=on]:text-gray-900"
          >
            Pan
          </Toggle.Root>
          <Toggle.Root
            pressed={activeMode === 'draw'}
            onPressedChange={() => handleModeChange('draw')}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 data-[state=on]:bg-gray-200 data-[state=on]:text-gray-900"
          >
            Draw
          </Toggle.Root>
          <Toggle.Root
            pressed={activeMode === 'edit'}
            onPressedChange={() => handleModeChange('edit')}
            className="px-3 py-2 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 data-[state=on]:bg-gray-200 data-[state=on]:text-gray-900"
          >
            Edit
          </Toggle.Root>
        </div>
      </div>

      <Separator.Root className="my-4 bg-gray-300 h-px" />
      */}

      {/* Toggle Controls */}
      <div className="mb-4">
        <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Display</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-aero-label text-gray-600">Geographic Grid</label>
            <Switch.Root
              checked={gridEnabled}
              onCheckedChange={setGridEnabled}
              className="w-9 h-5 bg-gray-300 rounded-full relative data-[state=checked]:bg-gray-600 transition-colors"
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4" />
            </Switch.Root>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-aero-label text-gray-600">Measure</label>
            <Switch.Root
              checked={measureEnabled}
              onCheckedChange={setMeasureEnabled}
              className="w-9 h-5 bg-gray-300 rounded-full relative data-[state=checked]:bg-gray-600 transition-colors"
            >
              <Switch.Thumb className="block w-4 h-4 bg-white rounded-full shadow-sm transition-transform data-[state=checked]:translate-x-4" />
            </Switch.Root>
          </div>
        </div>
      </div>

      <Separator.Root className="my-4 bg-gray-300 h-px" />

      {/* Action Buttons */}
      <div className="mb-4">
        <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Actions</h3>
        <div className="flex space-x-2">
          <button
            onClick={onUndo}
            className="px-3 py-2 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
            Undo
          </button>
          <button
            onClick={onRedo}
            className="px-3 py-2 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700">
            Redo
          </button>
          <button 
            onClick={handleAddWPTsClick}
            className={`px-3 py-2 text-xs font-medium rounded border transition-colors ${
              drawingState.isDrawing
                ? 'border-red-300 bg-red-50 hover:bg-red-100 text-red-700'
                : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
            }`}
          >
            Add WPTs
          </button>
        </div>
      </div>
    </div>
  );
};