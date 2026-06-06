import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { usePerformance } from '../contexts/PerformanceContext';
import { generateRegimeId, flightPlanUtils } from '../utils/flightPlanUtils';
import { propagateRegimeCruiseChange, clearRegimeFromAllWaypoints } from '../utils/regimeUtils';
import type { Regime, Aircraft } from '../types/flightPlan';
import PerformanceImportDialog from './PerformanceImportDialog';

// --- Editor form types ---

interface SectionFields {
  tas: string;
  ff: string;
  rate: string; // roc or rod
}

interface FormState {
  name: string;
  comment: string;
  cruiseTas: string;
  cruiseFf: string;
  climb: SectionFields;
  descent: SectionFields;
}

function toFormState(regime: Regime): FormState {
  return {
    name: regime.name,
    comment: regime.comment ?? '',
    cruiseTas: String(regime.cruise.tas),
    cruiseFf: String(regime.cruise.ff),
    climb: regime.climb
      ? { tas: String(regime.climb.tas), ff: String(regime.climb.ff), rate: String(regime.climb.roc) }
      : { tas: '', ff: '', rate: '' },
    descent: regime.descent
      ? { tas: String(regime.descent.tas), ff: String(regime.descent.ff), rate: String(regime.descent.rod) }
      : { tas: '', ff: '', rate: '' },
  };
}

function parsePositive(s: string): number | null {
  if (s.trim() === '') return null;
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? n : null;
}

function parseSectionToRegime(sec: SectionFields): { tas: number; ff: number; rate: number } | null | 'partial' {
  const t = parsePositive(sec.tas);
  const f = parsePositive(sec.ff);
  const r = parsePositive(sec.rate);
  const filled = [sec.tas, sec.ff, sec.rate].filter(v => v.trim() !== '');
  if (filled.length === 0) return null;
  if (t !== null && f !== null && r !== null) return { tas: t, ff: f, rate: r };
  return 'partial';
}

function validate(form: FormState, allRegimes: Regime[], currentId: string) {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = 'Name is required.';
  else if (allRegimes.some(r => r.id !== currentId && r.name === form.name.trim()))
    errors.name = 'Name must be unique.';
  if (!parsePositive(form.cruiseTas)) errors.cruiseTas = 'Must be > 0.';
  if (!parsePositive(form.cruiseFf)) errors.cruiseFf = 'Must be > 0.';
  const climbResult = parseSectionToRegime(form.climb);
  if (climbResult === 'partial') errors.climb = 'Fill all fields or leave all empty.';
  const descentResult = parseSectionToRegime(form.descent);
  if (descentResult === 'partial') errors.descent = 'Fill all fields or leave all empty.';
  return errors;
}

function formToRegime(form: FormState, id: string): Regime | null {
  const tas = parsePositive(form.cruiseTas);
  const ff = parsePositive(form.cruiseFf);
  if (!tas || !ff || !form.name.trim()) return null;
  const climbParsed = parseSectionToRegime(form.climb);
  const descentParsed = parseSectionToRegime(form.descent);
  if (climbParsed === 'partial' || descentParsed === 'partial') return null;
  return {
    id,
    name: form.name.trim(),
    comment: form.comment.trim() || undefined,
    cruise: { tas, ff },
    climb: climbParsed ? { tas: climbParsed.tas, ff: climbParsed.ff, roc: climbParsed.rate } : undefined,
    descent: descentParsed ? { tas: descentParsed.tas, ff: descentParsed.ff, rod: descentParsed.rate } : undefined,
  };
}

// --- RegimeEditor ---

const NumericInput: React.FC<{
  label: string; unit: string; value: string; error?: string;
  onChange: (v: string) => void;
}> = ({ label, unit, value, error, onChange }) => (
  <div className="space-y-0.5">
    <div className="flex items-center justify-between">
      <span className="text-xs font-aero-label text-gray-600 w-24">{label}</span>
      <div className="flex items-center space-x-1">
        <input
          type="number"
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-24 text-right text-sm font-aero-mono border rounded px-2 py-0.5 focus:outline-none ${
            error ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white focus:border-gray-500'
          }`}
        />
        <span className="text-xs font-aero-label text-gray-500 w-8">{unit}</span>
      </div>
    </div>
    {error && <p className="text-xs text-red-500 text-right">{error}</p>}
  </div>
);

const RegimeEditor: React.FC<{
  regime: Regime;
  allRegimes: Regime[];
  onChange: (updated: Regime) => void;
  onDeleteRequest: () => void;
  autoFocusName?: boolean;
}> = ({ regime, allRegimes, onChange, onDeleteRequest, autoFocusName }) => {
  const [form, setForm] = useState<FormState>(() => toFormState(regime));
  const errors = validate(form, allRegimes, regime.id);

  const applyChange = (updatedForm: FormState) => {
    setForm(updatedForm);
    const updated = formToRegime(updatedForm, regime.id);
    if (updated) onChange(updated);
  };

  const setClimb = (field: keyof SectionFields, val: string) =>
    applyChange({ ...form, climb: { ...form.climb, [field]: val } });

  const setDescent = (field: keyof SectionFields, val: string) =>
    applyChange({ ...form, descent: { ...form.descent, [field]: val } });

  return (
    <div className="p-6 max-w-lg">
      <h3 className="text-sm font-aero-label text-gray-700 uppercase mb-4">Edit Regime</h3>

      {/* Name */}
      <div className="mb-4 space-y-1">
        <label className="text-xs font-aero-label text-gray-600 uppercase">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={e => applyChange({ ...form, name: e.target.value })}
          autoFocus={autoFocusName}
          className={`w-full text-sm font-aero-mono border rounded px-2 py-1 focus:outline-none ${
            errors.name ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-gray-500'
          }`}
        />
        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
      </div>

      {/* Comment */}
      <div className="mb-5 space-y-1">
        <label className="text-xs font-aero-label text-gray-600 uppercase">Comment</label>
        <textarea
          value={form.comment}
          onChange={e => applyChange({ ...form, comment: e.target.value })}
          rows={2}
          className="w-full text-sm font-aero-mono border border-gray-300 rounded px-2 py-1 focus:outline-none focus:border-gray-500 resize-none"
        />
      </div>

      {/* Cruise */}
      <div className="mb-5">
        <h4 className="text-xs font-aero-label text-gray-500 uppercase mb-2">Cruise</h4>
        <div className="space-y-2">
          <NumericInput label="TAS" unit="kts" value={form.cruiseTas} error={errors.cruiseTas}
            onChange={v => applyChange({ ...form, cruiseTas: v })} />
          <NumericInput label="Fuel Flow" unit="pph" value={form.cruiseFf} error={errors.cruiseFf}
            onChange={v => applyChange({ ...form, cruiseFf: v })} />
        </div>
      </div>

      {/* Climb */}
      <div className="mb-5">
        <h4 className="text-xs font-aero-label text-gray-500 uppercase mb-2">Climb up to this regime</h4>
        <div className="space-y-2">
          <NumericInput label="TAS" unit="kts" value={form.climb.tas}
            onChange={v => setClimb('tas', v)} />
          <NumericInput label="Fuel Flow" unit="pph" value={form.climb.ff}
            onChange={v => setClimb('ff', v)} />
          <NumericInput label="ROC" unit="fpm" value={form.climb.rate}
            onChange={v => setClimb('rate', v)} />
        </div>
        {errors.climb && <p className="text-xs text-red-500 mt-1">{errors.climb}</p>}
      </div>

      {/* Descent */}
      <div className="mb-8">
        <h4 className="text-xs font-aero-label text-gray-500 uppercase mb-2">Descent down to this regime</h4>
        <div className="space-y-2">
          <NumericInput label="TAS" unit="kts" value={form.descent.tas}
            onChange={v => setDescent('tas', v)} />
          <NumericInput label="Fuel Flow" unit="pph" value={form.descent.ff}
            onChange={v => setDescent('ff', v)} />
          <NumericInput label="ROD" unit="fpm" value={form.descent.rate}
            onChange={v => setDescent('rate', v)} />
        </div>
        {errors.descent && <p className="text-xs text-red-500 mt-1">{errors.descent}</p>}
      </div>

      {/* Delete */}
      <button
        onClick={onDeleteRequest}
        className="text-sm font-aero-label text-red-600 border border-red-300 px-4 py-1.5 rounded hover:bg-red-50 transition-colors"
      >
        Delete regime
      </button>
    </div>
  );
};

// --- Delete confirm dialog ---

const DeleteRegimeDialog: React.FC<{
  regime: Regime;
  refCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ regime, refCount, onConfirm, onCancel }) => (
  <Dialog.Root open onOpenChange={open => !open && onCancel()}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content aria-describedby="delete-regime-desc" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw]">
        <Dialog.Title className="text-base font-semibold mb-3">Delete Regime</Dialog.Title>
        <p id="delete-regime-desc" className="text-sm text-gray-600 mb-6">
          {refCount > 0
            ? `This regime is used on ${refCount} leg${refCount !== 1 ? 's' : ''}. Deleting will revert them to Manual.`
            : `Delete "${regime.name}"? This action cannot be undone.`}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

// --- Main page ---

// --- Take-off time mm:ss parser/formatter ---

function parseMinSec(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '' || trimmed === '0:00' || trimmed === '00:00') return 0;
  const match = trimmed.match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  const m = parseInt(match[1], 10);
  const sec = parseInt(match[2], 10);
  return m * 60 + sec;
}

function formatMinSec(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PerformancePage: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate } = useFlightPlan();
  const { performance, setPerformance } = usePerformance();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Regime | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Aircraft header state (local string values for editing)
  const [toTimeStr, setToTimeStr] = useState(() => formatMinSec(performance.takeoff.timeSec));
  const [toFuelStr, setToFuelStr] = useState(() => String(performance.takeoff.fuel));
  const [toDistStr, setToDistStr] = useState(() => String(performance.takeoff.distance));
  const [toTimeError, setToTimeError] = useState<string | null>(null);

  const regimes = performance.regimes;

  const handleAddRegime = () => {
    const names = new Set(regimes.map(r => r.name));
    let n = 1;
    while (names.has(`Regime ${n}`)) n++;
    const newRegime: Regime = { id: generateRegimeId(), name: `Regime ${n}`, cruise: { tas: 400, ff: 3600 } };
    setPerformance({ ...performance, regimes: [...regimes, newRegime] });
    setSelectedId(newRegime.id);
    setNewlyAddedId(newRegime.id);
  };

  const handleRegimeChange = (updated: Regime) => {
    const current = regimes.find(r => r.id === updated.id);
    setPerformance({ ...performance, regimes: regimes.map(r => r.id === updated.id ? updated : r) });
    if (current && (current.cruise.tas !== updated.cruise.tas || current.cruise.ff !== updated.cruise.ff)) {
      onFlightPlanUpdate(propagateRegimeCruiseChange(flightPlan, updated));
    }
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    onFlightPlanUpdate(clearRegimeFromAllWaypoints(flightPlan, deleteTarget.id));
    setPerformance({ ...performance, regimes: regimes.filter(r => r.id !== deleteTarget.id) });
    if (selectedId === deleteTarget.id) setSelectedId(null);
    setDeleteTarget(null);
  };

  const updateAircraft = (patch: Partial<Aircraft>) => {
    setPerformance({ ...performance, ...patch });
  };

  const commitTakeoff = (timeSec: number, fuel: number, distance: number) => {
    const positiveCount = [timeSec, fuel, distance].filter(v => v > 0).length;
    if (positiveCount > 0 && positiveCount < 3) {
      setToTimeError('All three take-off fields must be positive, or all zero.');
      return;
    }
    setToTimeError(null);
    updateAircraft({ takeoff: { timeSec, fuel, distance } });
  };

  const selectedRegime = regimes.find(r => r.id === selectedId) ?? null;

  const TO_TOOLTIP = 'Time, fuel, and distance covered from brake release through acceleration to climb speed. Use values from your aircraft\'s performance charts for your T/O configuration. Or obtain by flight testing the difference between a cruise climb and the same climb from brake release.';

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden">
      {/* Aircraft header */}
      <div className="bg-white border-b border-gray-300 px-6 py-3 space-y-2 shrink-0">
        {/* Row 1: Aircraft name · T/O Config · export/import links */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs font-aero-label text-gray-500 whitespace-nowrap">Aircraft</label>
            <input
              type="text"
              value={performance.model}
              onChange={e => updateAircraft({ model: e.target.value })}
              placeholder="e.g. F-15E"
              className="text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:border-gray-500 w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-aero-label text-gray-500 whitespace-nowrap">T/O Config</label>
            <input
              type="text"
              value={performance.takeoffConfiguration}
              onChange={e => updateAircraft({ takeoffConfiguration: e.target.value })}
              placeholder="e.g. MIL @ 60klb"
              className="text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:border-gray-500 w-40"
            />
          </div>
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={() => flightPlanUtils.downloadAircraft(performance)}
              className="text-xs font-aero-label text-gray-400 hover:text-gray-600 transition-colors"
            >
              ⬇ Export
            </button>
            <button
              onClick={() => setShowImportDialog(true)}
              className="text-xs font-aero-label text-gray-400 hover:text-gray-600 transition-colors"
            >
              ⬆ Import
            </button>
          </div>
        </div>

        {/* Row 2: Taxi fuel */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-aero-label text-gray-500 whitespace-nowrap">Taxi fuel</label>
          <input
            type="number"
            value={performance.taxiFuel}
            min={0}
            onChange={e => updateAircraft({ taxiFuel: Math.max(0, Number(e.target.value)) })}
            className="text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:border-gray-500 w-20 text-right"
          />
          <span className="text-xs font-aero-label text-gray-400">lbs</span>
        </div>

        {/* Row 3: T/O performance */}
        <div className="flex items-start gap-2 flex-wrap">
          <label className="text-xs font-aero-label text-gray-500 whitespace-nowrap mt-0.5">T/O perf</label>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={toTimeStr}
              onChange={e => setToTimeStr(e.target.value)}
              onBlur={() => {
                const secs = parseMinSec(toTimeStr);
                if (secs === null) {
                  setToTimeError('Invalid time format. Use mm:ss.');
                  return;
                }
                setToTimeStr(formatMinSec(secs));
                commitTakeoff(secs, Math.max(0, Number(toFuelStr)), Math.max(0, Number(toDistStr)));
              }}
              placeholder="mm:ss"
              className={`text-sm font-aero-mono border rounded px-2 py-0.5 focus:outline-none w-16 text-right ${toTimeError ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-gray-500'}`}
            />
            <span className="text-xs font-aero-label text-gray-400">mm:ss</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={toFuelStr}
              min={0}
              onChange={e => setToFuelStr(e.target.value)}
              onBlur={() => {
                const secs = parseMinSec(toTimeStr) ?? performance.takeoff.timeSec;
                commitTakeoff(secs, Math.max(0, Number(toFuelStr)), Math.max(0, Number(toDistStr)));
              }}
              className={`text-sm font-aero-mono border rounded px-2 py-0.5 focus:outline-none w-20 text-right ${toTimeError ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-gray-500'}`}
            />
            <span className="text-xs font-aero-label text-gray-400">lbs</span>
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={toDistStr}
              min={0}
              step={0.1}
              onChange={e => setToDistStr(e.target.value)}
              onBlur={() => {
                const secs = parseMinSec(toTimeStr) ?? performance.takeoff.timeSec;
                commitTakeoff(secs, Math.max(0, Number(toFuelStr)), Math.max(0, Number(toDistStr)));
              }}
              className={`text-sm font-aero-mono border rounded px-2 py-0.5 focus:outline-none w-20 text-right ${toTimeError ? 'border-red-400 bg-red-50' : 'border-gray-300 focus:border-gray-500'}`}
            />
            <span className="text-xs font-aero-label text-gray-400">NM</span>
          </div>
          <span
            title={TO_TOOLTIP}
            className="text-gray-400 hover:text-gray-600 cursor-help text-sm leading-none mt-0.5"
            aria-label="Take-off performance info"
          >ⓘ</span>
          {toTimeError && <p className="text-xs text-red-500 w-full mt-0.5">{toTimeError}</p>}
        </div>
      </div>

      {/* Body: regime list + editor */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-[400px] shrink-0 h-full bg-gray-50 border-r border-gray-300 flex flex-col">
          <div className="p-3">
            <button
              onClick={handleAddRegime}
              className="w-full text-left px-3 py-2 text-sm font-aero-label text-gray-700 border border-dashed border-gray-300 rounded hover:bg-gray-100 hover:border-gray-400 transition-colors"
            >
              + Add regime
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {regimes.map(regime => (
              <button
                key={regime.id}
                onClick={() => { setSelectedId(regime.id); setNewlyAddedId(null); }}
                className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
                  selectedId === regime.id ? 'bg-gray-200 text-gray-900 border border-gray-400' : 'hover:bg-gray-200 text-gray-900'
                }`}
              >
                <span className="font-aero-label">{regime.name}</span>
                <span className="flex gap-1">
                  {regime.climb && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${selectedId === regime.id ? 'bg-gray-300 text-gray-700' : 'bg-gray-200 text-gray-600'}`}>↑</span>
                  )}
                  {regime.descent && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${selectedId === regime.id ? 'bg-gray-300 text-gray-700' : 'bg-gray-200 text-gray-600'}`}>↓</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right pane */}
        <div className="flex-1 h-full overflow-y-auto bg-gray-100">
          {selectedRegime ? (
            <RegimeEditor
              key={selectedRegime.id}
              regime={selectedRegime}
              allRegimes={regimes}
              onChange={handleRegimeChange}
              onDeleteRequest={() => setDeleteTarget(selectedRegime)}
              autoFocusName={newlyAddedId === selectedRegime.id}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              {regimes.length === 0 ? (
                <div className="max-w-sm text-center space-y-3 px-6">
                  <p className="font-aero-label text-gray-700 text-sm font-semibold">No performance regimes defined</p>
                  <p className="font-aero-label text-gray-500 text-xs leading-relaxed">
                    A <strong>regime</strong> captures your aircraft&apos;s performance for a given configuration and power setting — cruise speed, fuel flow, and optionally climb and descent parameters.
                  </p>
                  <p className="font-aero-label text-gray-500 text-xs leading-relaxed">
                    Once you define regimes, you can assign them to individual legs on your route. DCS Plan will then compute fuel burn, time en route, and transition segments automatically.
                  </p>
                  <p className="font-aero-label text-gray-400 text-xs">
                    Click <span className="text-gray-600">&ldquo;+ Add regime&rdquo;</span> on the left to get started.
                  </p>
                </div>
              ) : (
                <p className="font-aero-label text-gray-500 text-sm">Select a regime to edit.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <DeleteRegimeDialog
          regime={deleteTarget}
          refCount={flightPlan.points.filter(p => p.regimeId === deleteTarget.id).length}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showImportDialog && (
        <PerformanceImportDialog
          onClose={() => setShowImportDialog(false)}
        />
      )}
    </div>
  );
};

export default PerformancePage;
