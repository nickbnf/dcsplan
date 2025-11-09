import React from 'react';
import * as Separator from '@radix-ui/react-separator';
import type { FlightPlan } from '../../types/flightPlan';
import type { DrawingState } from '../../hooks/useDrawing';
import { flightPlanUtils } from '../../utils/flightPlanUtils';
import { ClearFlightPlanDialog } from './ClearFlightPlanDialog';

interface ButtonZoneProps {
  drawingState: DrawingState;
  flightPlan: FlightPlan;
  onUndo?: () => void;
  onRedo?: () => void;
  onStartDrawing: (map: any, existingFlightPlan?: any) => void;
  onStopDrawing: (map: any) => void;
  onFlightPlanUpdate: (flightPlan: FlightPlan) => void;
}

export const ButtonZone: React.FC<ButtonZoneProps> = ({
  drawingState,
  flightPlan,
  onUndo,
  onRedo,
  onStartDrawing,
  onStopDrawing,
  onFlightPlanUpdate,
}) => {
  const declination = flightPlan.declination

  const handleAddWPTsClick = () => {
    // Get the map instance from the window (we'll need to expose it from Map component)
    const mapInstance = (window as any).mapInstance;
    if (!mapInstance) {
      console.error('Map instance not found');
      return;
    }

    if (drawingState.isDrawing === 'NEW_POINT') {
      onStopDrawing(mapInstance);
    } else {
      onStartDrawing(mapInstance, flightPlan);
    }
  };

  return (
    <div className="p-4 bg-white">

      {/* Settings */}
      <div className="mb-4">
        <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Settings</h3>
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-aero-label text-gray-600">Declination</label>
              <span className="text-sm font-aero-label text-gray-700">
                {declination === 0 ? '0°' : declination > 0 ? `${declination}°E` : `${Math.abs(declination)}°W`}
              </span>
            </div>
            <input
              type="range"
              min="-15"
              max="15"
              step="0.5"
              value={declination}
              onChange={(e) => { 
                  const updatedFlightPlan = flightPlanUtils.updateDeclination(flightPlan, parseFloat(e.target.value));
                  console.log(updatedFlightPlan)
                  onFlightPlanUpdate(updatedFlightPlan);
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((declination + 15) / 30) * 100}%, #e5e7eb ${((declination + 15) / 30) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>
        </div>
      </div>

      <Separator.Root className="my-4 bg-gray-300 h-px" />

      {/* Action Buttons */}
      <div className="mb-4">
        <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-3">Actions</h3>
        <div className="flex space-x-2 flex-wrap gap-2">
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
              drawingState.isDrawing === 'NEW_POINT'
                ? 'border-red-300 bg-red-50 hover:bg-red-100 text-red-700'
                : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700'
            }`}
          >
            Add WPTs
          </button>
          <ClearFlightPlanDialog 
            onConfirm={() => {
              const newFlightPlan = flightPlanUtils.newFlightPlan();
              onFlightPlanUpdate(newFlightPlan);
            }}
          />
        </div>
      </div>
    </div>
  );
};