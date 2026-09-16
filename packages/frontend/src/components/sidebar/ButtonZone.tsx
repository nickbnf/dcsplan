import React from 'react';
import type { FlightPlan } from '../../types/flightPlan';
import type { FlightPlanUpdateOptions } from '../../contexts/FlightPlanContext';
import { flightPlanUtils } from '../../utils/flightPlanUtils';
import type { TheatreMetadata } from '../../hooks/useTheatres';
import { NewFlightPlanDialog } from './NewFlightPlanDialog';

interface ButtonZoneProps {
  flightPlan: FlightPlan;
  theatres: TheatreMetadata[];
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onFlightPlanUpdate: (flightPlan: FlightPlan, options?: FlightPlanUpdateOptions) => void;
  /** Wholesale replacement — not undoable, clears history (AD-12). */
  onFlightPlanReplace: (flightPlan: FlightPlan) => void;
  isSettingsOpen: boolean;
  onSettingsToggle: () => void;
  importTrigger: React.ReactNode;
  onExport: () => void;
}

const actionButtonClass =
  'px-2.5 py-1.5 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors';

const disabledButtonClass =
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white';

export const ButtonZone: React.FC<ButtonZoneProps> = ({
  flightPlan,
  theatres,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onFlightPlanUpdate,
  onFlightPlanReplace,
  isSettingsOpen,
  onSettingsToggle,
  importTrigger,
  onExport,
}) => {
  const declination = flightPlan.declination;
  const bankAngle = flightPlan.bankAngle;

  return (
    <div className="bg-white border-b border-gray-200">

      {/* Plan parameters — collapsible */}
      <button
        onClick={onSettingsToggle}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-aero-label text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="uppercase tracking-wide">Plan Parameters</span>
        <span className="text-gray-400">{isSettingsOpen ? '▲' : '▼'}</span>
      </button>

      {isSettingsOpen && (
        <div className="px-4 pb-3 space-y-3 border-t border-gray-100">
          <div className="space-y-1 pt-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-aero-label text-gray-600">Declination</label>
              <span className="text-xs font-aero-label text-gray-700">
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
                onFlightPlanUpdate(updatedFlightPlan, { coalesceKey: 'plan:declination' });
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((declination + 15) / 30) * 100}%, #e5e7eb ${((declination + 15) / 30) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-aero-label text-gray-600">Bank Angle</label>
              <span className="text-xs font-aero-label text-gray-700">{bankAngle}°</span>
            </div>
            <input
              type="range"
              min="5"
              max="85"
              step="5"
              value={bankAngle}
              onChange={(e) => {
                const updatedFlightPlan = flightPlanUtils.updateBankAngle(flightPlan, parseFloat(e.target.value));
                onFlightPlanUpdate(updatedFlightPlan, { coalesceKey: 'plan:bankAngle' });
              }}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #6b7280 0%, #6b7280 ${((bankAngle - 5) / 80) * 100}%, #e5e7eb ${((bankAngle - 5) / 80) * 100}%, #e5e7eb 100%)`
              }}
            />
          </div>
        </div>
      )}

      {/* Unified action row: history | file | destructive */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className={`${actionButtonClass} ${disabledButtonClass}`}
          >
            Undo
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className={`${actionButtonClass} ${disabledButtonClass}`}
          >
            Redo
          </button>
          <div className="w-px h-5 bg-gray-200 mx-1" aria-hidden />
          {importTrigger}
          <button onClick={onExport} className={actionButtonClass}>
            <span aria-hidden>⬇</span> Export
          </button>
        </div>
        <NewFlightPlanDialog
          currentPlan={flightPlan}
          theatres={theatres}
          onCreatePlan={onFlightPlanReplace}
        />
      </div>
    </div>
  );
};