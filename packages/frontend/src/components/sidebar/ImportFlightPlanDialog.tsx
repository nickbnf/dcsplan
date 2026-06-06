import React, { useState, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { FlightPlan, Aircraft, LibraryObject } from '../../types/flightPlan';
import { defaultAircraft } from '../../types/flightPlan';
import { getApiUrl } from '../../config/api';
import { parseAircraftBlock } from '../../utils/performanceStorage';
import { usePerformance } from '../../contexts/PerformanceContext';

interface ImportFlightPlanDialogProps {
  onImport: (flightPlan: FlightPlan) => void;
  onLibrarySnapshot?: (snapshot: LibraryObject[]) => void;
  onPerformanceSnapshot?: (snapshot: Aircraft) => void;
  currentLibrary?: LibraryObject[];
}

function parseValidationError(error: any): string {
  if (typeof error === 'string') return error;
  if (error.detail) {
    if (Array.isArray(error.detail)) {
      return error.detail
        .map((err: any) => `${err.loc ? err.loc.join('.') : 'field'}: ${err.msg || 'Invalid value'}`)
        .join('\n');
    }
    if (typeof error.detail === 'string') return error.detail;
  }
  return error.message ?? 'An unknown error occurred while importing the flight plan.';
}

export const ImportFlightPlanDialog: React.FC<ImportFlightPlanDialogProps> = ({
  onImport,
  onLibrarySnapshot,
  onPerformanceSnapshot,
  currentLibrary = [],
}) => {
  const { performance: currentPerformance } = usePerformance();
  const hasExistingProfile = currentPerformance.model !== '' || currentPerformance.regimes.length > 0;

  const [isOpen, setIsOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validatedPlan, setValidatedPlan] = useState<FlightPlan | null>(null);
  const [snapshotEntries, setSnapshotEntries] = useState<LibraryObject[]>([]);
  const [validatedPerformance, setValidatedPerformance] = useState<Aircraft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setValidatedPlan(null);
    setSnapshotEntries([]);
    setValidatedPerformance(null);
    setErrors([]);
    setIsValidating(true);

    try {
      let jsonData: any;
      try {
        jsonData = JSON.parse(await file.text());
      } catch {
        setErrors(['Invalid JSON: unable to parse file.']);
        return;
      }

      if (!jsonData.version || !jsonData.flightPlan) {
        setErrors(['Invalid flight plan format: missing version or flightPlan field.']);
        return;
      }

      // Extract performance snapshot (v1.5: top-level; v1.4: inside flightPlan.aircraft)
      const rawPerformance = jsonData.performanceSnapshot ?? jsonData.flightPlan?.aircraft;
      let extractedPerformance: Aircraft | null = null;
      if (rawPerformance) {
        const perfResult = parseAircraftBlock(rawPerformance);
        if (perfResult.ok) extractedPerformance = perfResult.aircraft;
      }
      setValidatedPerformance(extractedPerformance);

      // Extract library snapshot before sending to backend (backend doesn't know about it)
      const snapshot: LibraryObject[] = Array.isArray(jsonData.librarySnapshot)
        ? jsonData.librarySnapshot
        : [];
      setSnapshotEntries(snapshot);

      // Wire-format marshaling: backend expects aircraft inside flightPlan
      const wireBody = {
        ...jsonData,
        flightPlan: {
          ...jsonData.flightPlan,
          aircraft: extractedPerformance ?? defaultAircraft(),
        },
      };
      delete wireBody.performanceSnapshot;

      const response = await fetch(getApiUrl('flightplan/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wireBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        setErrors([parseValidationError(errorData)]);
        return;
      }

      const data = await response.json();
      // Strip aircraft back off: FlightPlan type no longer carries it
      const { aircraft: _aircraft, ...planWithoutAircraft } = data.flightPlan;
      setValidatedPlan(planWithoutAircraft as FlightPlan);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to validate flight plan.']);
    } finally {
      setIsValidating(false);
    }
  };

  const handleReplace = () => {
    if (!validatedPlan) return;
    onImport(validatedPlan);
    if (onLibrarySnapshot && snapshotEntries.length > 0) {
      onLibrarySnapshot(snapshotEntries);
    }
    if (onPerformanceSnapshot && validatedPerformance) {
      onPerformanceSnapshot(validatedPerformance);
    }
    handleClose();
  };

  const handleClose = () => {
    setIsOpen(false);
    setFileName(null);
    setValidatedPlan(null);
    setSnapshotEntries([]);
    setValidatedPerformance(null);
    setErrors([]);
    setIsValidating(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Compute merge preview
  const existingIds = new Set(currentLibrary.map(e => e.id));
  const toAdd = snapshotEntries.filter(e => !existingIds.has(e.id)).length;
  const kept = snapshotEntries.length - toAdd;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => setIsOpen(true)}
        className="px-2.5 py-1.5 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
      >
        <span aria-hidden>⬆</span> Import
      </button>

      <Dialog.Root open={isOpen} onOpenChange={open => !open && handleClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50" />
          <Dialog.Content
            aria-describedby="fp-import-desc"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-[420px] max-w-[90vw]"
          >
            <Dialog.Title className="text-base font-semibold mb-4">Replace flight plan?</Dialog.Title>

            {!fileName ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-gray-300 rounded px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 mb-4"
              >
                Select a .json file
              </button>
            ) : (
              <div id="fp-import-desc" className="mb-4 space-y-2 text-sm text-gray-700">
                {isValidating ? (
                  <p className="text-gray-500">Validating {fileName}…</p>
                ) : validatedPlan ? (
                  <>
                    <div><span className="text-gray-500">File:</span> {fileName}</div>
                    <div><span className="text-gray-500">Plan:</span> {validatedPlan.name || '—'}</div>
                    <div><span className="text-gray-500">Waypoints:</span> {validatedPlan.points.length}</div>
                    {validatedPerformance && (
                      <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                        <div className="font-medium text-amber-800 mb-1">Performance profile in file:</div>
                        <div className="text-amber-700">
                          {validatedPerformance.model || '—'} · {validatedPerformance.regimes.length} regime{validatedPerformance.regimes.length !== 1 ? 's' : ''}
                          {hasExistingProfile && ' — your current profile will be replaced'}
                        </div>
                      </div>
                    )}
                    {snapshotEntries.length > 0 && (
                      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                        <div className="font-medium text-blue-800 mb-1">Library objects in file:</div>
                        {toAdd > 0 && <div className="text-green-700">+ {toAdd} new {toAdd === 1 ? 'entry' : 'entries'} will be added to your library</div>}
                        {kept > 0 && <div className="text-gray-500">= {kept} {kept === 1 ? 'entry' : 'entries'} already present (kept unchanged)</div>}
                      </div>
                    )}
                  </>
                ) : (
                  <div><span className="text-gray-500">File:</span> {fileName}</div>
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
                onClick={handleClose}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReplace}
                disabled={!validatedPlan}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Replace
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};
