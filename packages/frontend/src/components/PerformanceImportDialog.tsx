import React, { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { FlightPlan, Aircraft } from '../types/flightPlan';
import { validatePerformancePackage } from '../utils/performanceImport';

interface Props {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (plan: FlightPlan) => void;
  onClose: () => void;
}

const PerformanceImportDialog: React.FC<Props> = ({ flightPlan, onFlightPlanUpdate, onClose }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validatedAircraft, setValidatedAircraft] = useState<Aircraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrors([]);
    setValidatedAircraft(null);

    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      setErrors(['Invalid JSON: unable to parse file.']);
      return;
    }

    const result = validatePerformancePackage(parsed);
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      setValidatedAircraft(result.aircraft);
    }
  };

  const handleReplace = () => {
    if (!validatedAircraft) return;

    const newAircraft: Aircraft = JSON.parse(JSON.stringify(validatedAircraft));
    const importedRegimeIds = new Set(newAircraft.regimes.map(r => r.id));
    const newPoints = flightPlan.points.map(p =>
      p.regimeId && !importedRegimeIds.has(p.regimeId)
        ? { ...p, regimeId: undefined }
        : p
    );
    onFlightPlanUpdate({ ...flightPlan, aircraft: newAircraft, points: newPoints });
    onClose();
  };

  const waypointsWithRegime = flightPlan.points.filter(p => p.regimeId).length;

  return (
    <Dialog.Root open onOpenChange={open => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content aria-describedby="perf-import-desc" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-[420px] max-w-[90vw]">
          <Dialog.Title className="text-base font-semibold mb-4">Replace performance?</Dialog.Title>

          {/* File picker */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="hidden"
          />
          {!fileName ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-gray-300 rounded px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 mb-4"
            >
              Select a .json file
            </button>
          ) : (
            <div id="perf-import-desc" className="mb-4 space-y-2 text-sm text-gray-700">
              <div><span className="text-gray-500">File:</span> {fileName}</div>

              {validatedAircraft && (
                <>
                  <div>
                    <span className="text-gray-500">Aircraft:</span>{' '}
                    {validatedAircraft.model || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">T/O Config:</span>{' '}
                    {validatedAircraft.takeoffConfiguration || '—'}
                  </div>
                  <div>
                    <span className="text-gray-500">Regimes:</span>{' '}
                    {validatedAircraft.regimes.length}
                  </div>
                  {waypointsWithRegime > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                      {waypointsWithRegime} waypoint{waypointsWithRegime !== 1 ? 's' : ''} currently use a regime.
                      Bindings that no longer match will revert to Manual.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 space-y-1">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReplace}
              disabled={!validatedAircraft}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Replace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PerformanceImportDialog;
