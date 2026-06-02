import React, { useState, useRef, useCallback, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { useLibrary, createLibraryEntry } from '../contexts/LibraryContext';
import { LibrarySelectionProvider, useLibrarySelection } from '../contexts/LibrarySelectionContext';
import { getAllPictograms, getPictogramDef, isRangedType } from '../utils/pictogramCatalog';
import { parseLibraryFile, serializeLibraryFile, mergeLibraryEntries, replaceLibraryEntries } from '../utils/libraryStorage';
import type { LibraryObject, PictogramType } from '../types/flightPlan';
import LibraryMap from './LibraryMap';
import { TypeStampedAddToggle } from './sidebar/TypeStampedAddToggle';

// ── Entry card ────────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: LibraryObject;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<LibraryObject>) => void;
  onDelete: () => void;
  isReferencedByPlan: boolean;
}

const EntryCard: React.FC<EntryCardProps> = ({
  entry,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
  isReferencedByPlan,
}) => {
  const { coordEntry } = useLibrarySelection();
  const isEditingCoord = isSelected && coordEntry !== null;
  const def = getPictogramDef(entry.type);
  const allPictograms = getAllPictograms();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [nameValue, setNameValue] = useState(entry.name ?? '');
  const [commentValue, setCommentValue] = useState(entry.defaultComment ?? '');
  const [rangeValue, setRangeValue] = useState(entry.range?.toString() ?? '');
  const cardRef = useRef<HTMLDivElement>(null);

  // Keep local state in sync with external updates (e.g., position from drag)
  useEffect(() => setNameValue(entry.name ?? ''), [entry.name]);
  useEffect(() => setCommentValue(entry.defaultComment ?? ''), [entry.defaultComment]);
  useEffect(() => setRangeValue(entry.range?.toString() ?? ''), [entry.range]);

  // Scroll into view when selected
  useEffect(() => {
    if (isSelected && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isSelected]);

  const formatCoord = (lat: number, lon: number) => {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    const fmt = (deg: number, minWidth: number) => {
      const abs = Math.abs(deg);
      const d = Math.floor(abs);
      const m = (abs - d) * 60;
      return `${d.toString().padStart(minWidth, '0')}°${m.toFixed(2).padStart(5, '0')}'`;
    };
    return `${latDir}${fmt(lat, 2)} ${lonDir}${fmt(lon, 3)}`;
  };

  const rangedType = isRangedType(entry.type);

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`p-3 rounded border cursor-pointer transition-colors ${
        isSelected
          ? 'border-[#FFB300] bg-amber-50'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {/* Header row */}
      <div className="flex items-start gap-2 mb-2">
        {/* Pictogram picker */}
        <select
          value={entry.type}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ type: e.target.value as PictogramType, range: undefined })}
          className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white font-aero-label"
        >
          {allPictograms.map(p => (
            <option key={p.id} value={p.id}>{p.category.toUpperCase()}: {p.label}</option>
          ))}
        </select>

        {/* Type badge */}
        <span className={`text-xs font-aero-label px-1.5 py-0.5 rounded ${
          def.category === 'threat' ? 'bg-red-100 text-red-700' :
          def.category === 'friendly' ? 'bg-blue-100 text-blue-700' :
          def.category === 'landmark' ? 'bg-gray-100 text-gray-700' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {def.label}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={e => { e.stopPropagation(); setPendingDelete(true); }}
            className="text-gray-400 hover:text-red-500 transition-colors p-1 hover:bg-gray-100 rounded"
            title="Delete entry"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      {/* Name */}
      <input
        type="text"
        placeholder="Name (optional)"
        value={nameValue}
        onClick={e => e.stopPropagation()}
        onChange={e => setNameValue(e.target.value)}
        onBlur={() => onUpdate({ name: nameValue || undefined })}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full text-sm font-aero-label border border-gray-200 rounded px-2 py-1 mb-1 focus:outline-none focus:border-gray-400"
      />

      {/* Coordinates (read-only, with dimming during coord entry) */}
      <div className={`text-xs font-aero-mono mb-1 ${isEditingCoord ? 'text-gray-400' : 'text-gray-600'}`}>
        {isEditingCoord ? '✎ ' : ''}{formatCoord(entry.lat, entry.lon)}
      </div>

      {/* Range (only for ranged types) */}
      {rangedType && (
        <div className="flex items-center gap-2 mb-1">
          <label className="text-xs font-aero-label text-gray-500">Range</label>
          <input
            type="number"
            min="0"
            step="0.5"
            placeholder="NM"
            value={rangeValue}
            onClick={e => e.stopPropagation()}
            onChange={e => setRangeValue(e.target.value)}
            onBlur={() => {
              const v = parseFloat(rangeValue);
              onUpdate({ range: isNaN(v) ? undefined : v });
            }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-20 text-xs font-aero-mono border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:border-gray-400"
          />
          <span className="text-xs text-gray-400">NM</span>
        </div>
      )}

      {/* Default comment */}
      <textarea
        placeholder="Default comment (optional)"
        value={commentValue}
        onClick={e => e.stopPropagation()}
        onChange={e => setCommentValue(e.target.value)}
        onBlur={() => onUpdate({ defaultComment: commentValue || undefined })}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          if (e.key === 'Escape') {
            setCommentValue(entry.defaultComment ?? '');
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        rows={2}
        className="w-full text-xs font-aero-label border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-gray-400"
      />

      {/* Delete confirmation dialog */}
      <Dialog.Root open={pendingDelete} onOpenChange={open => !open && setPendingDelete(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content
            aria-describedby="lib-delete-desc"
            className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-[360px] max-w-[90vw]"
            onClick={e => e.stopPropagation()}
          >
            <Dialog.Title className="text-base font-semibold mb-3">Delete library entry?</Dialog.Title>
            <p id="lib-delete-desc" className="text-sm text-gray-600 mb-4">
              {entry.name ? `"${entry.name}"` : 'This entry'} will be permanently removed from the library.
              {isReferencedByPlan && (
                <span className="block mt-2 text-amber-700 font-medium">
                  ⚠ This entry is referenced by the current flight plan. Confirming will also remove that reference.
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDelete(); setPendingDelete(false); }}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};

// ── Import dialog ─────────────────────────────────────────────────────────────

interface ImportLibraryDialogProps {
  onImport: (entries: LibraryObject[], replace: boolean) => void;
}

const ImportLibraryDialog: React.FC<ImportLibraryDialogProps> = ({ onImport }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<LibraryObject[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [replaceMode, setReplaceMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { library } = useLibrary();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setParsed(null);
    setErrors([]);
    try {
      const data = JSON.parse(await file.text());
      const result = parseLibraryFile(data);
      if (!result.ok) { setErrors([result.error]); return; }
      setParsed(result.library);
    } catch {
      setErrors(['Invalid JSON: unable to parse file.']);
    }
  };

  const preview = parsed ? mergeLibraryEntries(library, parsed) : null;

  const handleConfirm = () => {
    if (!parsed) return;
    onImport(parsed, replaceMode);
    setIsOpen(false);
    setFileName(null);
    setParsed(null);
    setErrors([]);
    setReplaceMode(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    setIsOpen(false);
    setFileName(null);
    setParsed(null);
    setErrors([]);
    setReplaceMode(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs font-aero-label text-gray-400 hover:text-gray-600 transition-colors"
      >
        ⬆ Import
      </button>
      <Dialog.Root open={isOpen} onOpenChange={open => !open && handleClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
          <Dialog.Content
            aria-describedby="lib-import-desc"
            className="fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-[420px] max-w-[90vw]"
          >
            <Dialog.Title className="text-base font-semibold mb-4">Import library</Dialog.Title>

            {!fileName ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border border-dashed border-gray-300 rounded px-4 py-3 text-sm text-gray-500 hover:bg-gray-50 mb-4"
              >
                Select a .json file
              </button>
            ) : (
              <div id="lib-import-desc" className="mb-4 space-y-2 text-sm text-gray-700">
                <div><span className="text-gray-500">File:</span> {fileName}</div>
                {parsed && !replaceMode && preview && (
                  <>
                    <div className="text-green-700">+ {preview.added} entries to add</div>
                    <div className="text-gray-500">= {preview.kept} entries already present (kept)</div>
                  </>
                )}
                {parsed && replaceMode && (
                  <div className="text-amber-700">All {library.length} current entries will be replaced by {parsed.length} imported entries.</div>
                )}
              </div>
            )}

            {errors.length > 0 && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {errors.map((e, i) => <div key={i}>{e}</div>)}
              </div>
            )}

            {parsed && (
              <label className="flex items-center gap-2 mb-4 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceMode}
                  onChange={e => setReplaceMode(e.target.checked)}
                  className="rounded"
                />
                Replace current library (discard existing entries)
              </label>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={handleClose} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!parsed}
                className={`px-4 py-2 text-sm text-white rounded disabled:opacity-40 disabled:cursor-not-allowed ${
                  replaceMode ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {replaceMode ? 'Replace' : 'Import'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

// ── Page inner (uses LibrarySelectionContext) ─────────────────────────────────

const TheatreLibraryPageInner: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate } = useFlightPlan();
  const { library, addEntry, updateEntry, deleteEntry, setLibrary } = useLibrary();
  const { selectedId, setSelectedId } = useLibrarySelection();
  const [addType, setAddType] = useState<PictogramType>('sam_site');
  const [isAddMode, setIsAddMode] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  // Auto-fit on page mount when entries exist
  useEffect(() => {
    if (library.length > 0) setFitTrigger(1);
  }, []);

  const handleEntryCreate = useCallback((lat: number, lon: number) => {
    const entry = createLibraryEntry(addType, lat, lon);
    addEntry(entry);
    setSelectedId(entry.id);
    // Don't exit placement mode — batch placement
  }, [addType, addEntry, setSelectedId]);

  const handleEntryMove = useCallback((id: string, lat: number, lon: number) => {
    updateEntry(id, { lat, lon });
  }, [updateEntry]);

  const handleDelete = useCallback((id: string) => {
    deleteEntry(id);
    // Remove from plan if referenced
    if (flightPlan.libraryRefs?.some(r => r.uuid === id)) {
      onFlightPlanUpdate({
        ...flightPlan,
        libraryRefs: flightPlan.libraryRefs!.filter(r => r.uuid !== id),
      });
    }
    if (selectedId === id) setSelectedId(null);
  }, [deleteEntry, flightPlan, onFlightPlanUpdate, selectedId, setSelectedId]);

  const handleExport = () => {
    const file = serializeLibraryFile(library);
    const json = JSON.stringify(file, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${flightPlan.theatre || 'library'}.library.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (entries: LibraryObject[], replace: boolean) => {
    if (replace) {
      const result = replaceLibraryEntries(entries);
      setLibrary(result.merged);
    } else {
      const result = mergeLibraryEntries(library, entries);
      setLibrary(result.merged);
    }
  };

  const referencedIds = new Set((flightPlan.libraryRefs ?? []).map(r => r.uuid));

  return (
    <div className="flex flex-1 w-full overflow-hidden">
      {/* Left panel: entry list */}
      <div className="w-[380px] shrink-0 flex flex-col border-r border-gray-200 bg-gray-50">
        {/* Toolbar */}
        <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white">
          <TypeStampedAddToggle
            isActive={isAddMode}
            selectedType={addType}
            onToggle={() => setIsAddMode(prev => !prev)}
            onTypeChange={setAddType}
            label="Add"
          />
          <div className="ml-auto flex gap-2">
            <ImportLibraryDialog onImport={handleImport} />
            <button
              onClick={handleExport}
              className="text-xs font-aero-label text-gray-400 hover:text-gray-600 transition-colors"
            >
              ⬇ Export
            </button>
          </div>
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {library.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 font-aero-label">
              <p className="mb-2">No library entries yet.</p>
              <p>Click Add to place objects on the map,</p>
              <p>or import a library file.</p>
            </div>
          ) : (
            library.map(entry => (
              <EntryCard
                key={entry.id}
                entry={entry}
                isSelected={selectedId === entry.id}
                onSelect={() => setSelectedId(selectedId === entry.id ? null : entry.id)}
                onUpdate={updates => updateEntry(entry.id, updates)}
                onDelete={() => handleDelete(entry.id)}
                isReferencedByPlan={referencedIds.has(entry.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 bg-white">
          <span className="text-xs font-aero-label text-gray-400">
            {library.length} {library.length === 1 ? 'entry' : 'entries'} · {flightPlan.theatre}
          </span>
        </div>
      </div>

      {/* Right panel: map */}
      <div className="flex-1 overflow-hidden">
        <LibraryMap
          theatre={flightPlan.theatre}
          entries={library}
          onEntryMove={handleEntryMove}
          onEntryCreate={handleEntryCreate}
          isPlacementMode={isAddMode}
          fitTrigger={fitTrigger}
        />
      </div>
    </div>
  );
};

// ── Public page component ─────────────────────────────────────────────────────

export const TheatreLibraryPage: React.FC = () => (
  <LibrarySelectionProvider>
    <TheatreLibraryPageInner />
  </LibrarySelectionProvider>
);
