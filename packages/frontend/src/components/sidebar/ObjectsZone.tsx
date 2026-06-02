import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { FlightPlan, PlanLibraryRef, PlanMarker, PictogramType } from '../../types/flightPlan';
import { useLibrary } from '../../contexts/LibraryContext';
import { useObjectSelection } from '../../contexts/ObjectSelectionContext';
import { getPictogramDef, isRangedType, getAllPictograms } from '../../utils/pictogramCatalog';
import { TypeStampedAddToggle } from './TypeStampedAddToggle';

// ── Library ref card ──────────────────────────────────────────────────────────

interface LibraryRefCardProps {
  ref_: PlanLibraryRef;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateComment: (comment: string | undefined) => void;
  onDelete: () => void;
}

const LibraryRefCard: React.FC<LibraryRefCardProps> = ({
  ref_,
  isSelected,
  onSelect,
  onUpdateComment,
  onDelete,
}) => {
  const { library } = useLibrary();
  const entry = library.find(e => e.id === ref_.uuid);
  const [commentValue, setCommentValue] = useState(ref_.comment ?? '');
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => setCommentValue(ref_.comment ?? ''), [ref_.comment]);

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

  if (!entry) {
    return (
      <div
        ref={cardRef}
        className={`p-3 rounded border cursor-pointer ${isSelected ? 'border-[#FFB300] bg-amber-50' : 'border-gray-200 bg-white'}`}
        onClick={onSelect}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-aero-label italic">Library entry not found ({ref_.uuid.slice(0, 8)}…)</span>
          <button onClick={e => { e.stopPropagation(); onDelete(); }} className="text-gray-300 hover:text-red-400 transition-colors p-1 hover:bg-gray-100 rounded" title="Remove from plan">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
    );
  }

  const def = getPictogramDef(entry.type);

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`p-3 rounded border cursor-pointer transition-colors ${
        isSelected ? 'border-[#FFB300] bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-aero-label px-1.5 py-0.5 rounded ${
          def.category === 'threat' ? 'bg-red-100 text-red-700' :
          def.category === 'friendly' ? 'bg-blue-100 text-blue-700' :
          def.category === 'landmark' ? 'bg-gray-100 text-gray-700' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {def.label}
        </span>
        <span className="text-sm font-aero-label text-gray-800 flex-1 truncate">
          {entry.name || <em className="text-gray-400">Unnamed</em>}
        </span>
        <span className="text-xs text-gray-400 font-aero-label">library</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="text-gray-400 hover:text-red-500 transition-colors p-1 hover:bg-gray-100 rounded"
          title="Remove from plan"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>

      {/* Coordinates (read-only) */}
      <div className="text-xs font-aero-mono text-gray-500 mb-1">
        {formatCoord(entry.lat, entry.lon)}
      </div>

      {/* Range */}
      {entry.range !== undefined && (
        <div className="text-xs font-aero-label text-gray-500 mb-1">Range: {entry.range} NM</div>
      )}

      {/* Comment editor */}
      <textarea
        placeholder={entry.defaultComment ? `Default: ${entry.defaultComment}` : 'Per-plan comment…'}
        value={commentValue}
        onClick={e => e.stopPropagation()}
        onChange={e => setCommentValue(e.target.value)}
        onBlur={() => onUpdateComment(commentValue || undefined)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
          if (e.key === 'Escape') { setCommentValue(ref_.comment ?? ''); (e.target as HTMLTextAreaElement).blur(); }
        }}
        rows={2}
        className="w-full text-xs font-aero-label border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-gray-400"
      />
    </div>
  );
};

// ── Marker card ───────────────────────────────────────────────────────────────

interface MarkerCardProps {
  marker: PlanMarker;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<PlanMarker>) => void;
  onDelete: () => void;
}

const MarkerCard: React.FC<MarkerCardProps> = ({
  marker,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
}) => {
  const { coordEntry } = useObjectSelection();
  const isEditingCoord = isSelected && coordEntry !== null;
  const [commentValue, setCommentValue] = useState(marker.comment ?? '');
  const [rangeValue, setRangeValue] = useState(marker.range?.toString() ?? '');
  const cardRef = useRef<HTMLDivElement>(null);
  const rangedType = isRangedType(marker.type);
  const allPictograms = getAllPictograms();

  useEffect(() => setCommentValue(marker.comment ?? ''), [marker.comment]);
  useEffect(() => setRangeValue(marker.range?.toString() ?? ''), [marker.range]);

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

  return (
    <div
      ref={cardRef}
      onClick={onSelect}
      className={`p-3 rounded border cursor-pointer transition-colors ${
        isSelected ? 'border-[#FFB300] bg-amber-50' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <select
          value={marker.type}
          onClick={e => e.stopPropagation()}
          onChange={e => onUpdate({ type: e.target.value as PictogramType, range: undefined })}
          className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white font-aero-label"
        >
          {allPictograms.map((p: any) => (
            <option key={p.id} value={p.id}>{p.category.toUpperCase()}: {p.label}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400 font-aero-label">marker</span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          className="ml-auto text-gray-400 hover:text-red-500 transition-colors p-1 hover:bg-gray-100 rounded"
          title="Remove from plan"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>

      {/* Coordinates (read-only, with dimming during coord entry) */}
      <div className={`text-xs font-aero-mono mb-1 ${isEditingCoord ? 'text-gray-400' : 'text-gray-600'}`}>
        {isEditingCoord ? '✎ ' : ''}{formatCoord(marker.lat, marker.lon)}
      </div>

      {/* Range (only if ranged type) */}
      {rangedType && (
        <div className="flex items-center gap-2 mb-1">
          <label className="text-xs font-aero-label text-gray-500">Range</label>
          <input
            type="number" min="0" step="0.5" placeholder="NM"
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

      {/* Comment */}
      <textarea
        placeholder="Comment…"
        value={commentValue}
        onClick={e => e.stopPropagation()}
        onChange={e => setCommentValue(e.target.value)}
        onBlur={() => onUpdate({ comment: commentValue || undefined })}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
          if (e.key === 'Escape') { setCommentValue(marker.comment ?? ''); (e.target as HTMLTextAreaElement).blur(); }
        }}
        rows={2}
        className="w-full text-xs font-aero-label border border-gray-200 rounded px-2 py-1 resize-none focus:outline-none focus:border-gray-400"
      />
    </div>
  );
};

// ── Objects zone ──────────────────────────────────────────────────────────────

interface ObjectsZoneProps {
  flightPlan: FlightPlan;
  onFlightPlanUpdate: (plan: FlightPlan) => void;
  isAddMode: boolean;
  addType: PictogramType;
  onAddModeToggle: () => void;
  onAddTypeChange: (type: PictogramType) => void;
}

export const ObjectsZone: React.FC<ObjectsZoneProps> = ({
  flightPlan,
  onFlightPlanUpdate,
  isAddMode,
  addType,
  onAddModeToggle,
  onAddTypeChange,
}) => {
  const { selectedId, setSelectedId } = useObjectSelection();

  const refs = flightPlan.libraryRefs ?? [];
  const markers = flightPlan.markers ?? [];
  const hasObjects = refs.length > 0 || markers.length > 0;

  const updateRef = (uuid: string, updates: Partial<PlanLibraryRef>) => {
    onFlightPlanUpdate({
      ...flightPlan,
      libraryRefs: refs.map(r => r.uuid === uuid ? { ...r, ...updates } : r),
    });
  };

  const deleteRef = (uuid: string) => {
    onFlightPlanUpdate({
      ...flightPlan,
      libraryRefs: refs.filter(r => r.uuid !== uuid),
    });
    if (selectedId === uuid) setSelectedId(null);
  };

  const updateMarker = (id: string, updates: Partial<PlanMarker>) => {
    onFlightPlanUpdate({
      ...flightPlan,
      markers: markers.map(m => m.id === id ? { ...m, ...updates } : m),
    });
  };

  const deleteMarker = (id: string) => {
    onFlightPlanUpdate({
      ...flightPlan,
      markers: markers.filter(m => m.id !== id),
    });
    if (selectedId === id) setSelectedId(null);
  };

  return (
    <div className="flex-1 bg-gray-50 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 bg-white shrink-0">
        <TypeStampedAddToggle
          isActive={isAddMode}
          selectedType={addType}
          onToggle={onAddModeToggle}
          onTypeChange={onAddTypeChange}
          label="Add Marker"
        />
        <Link
          to="/library"
          className="ml-auto text-xs font-aero-label text-blue-500 hover:text-blue-700 transition-colors"
        >
          Manage Library →
        </Link>
      </div>

      {/* Object list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {!hasObjects ? (
          <div className="text-center py-8 text-sm text-gray-400 font-aero-label">
            <p className="mb-2">No objects in this plan.</p>
            <p>Click a library pictogram on the map to add it,</p>
            <p>or use Add Marker to place one-off markers.</p>
          </div>
        ) : (
          <>
            {refs.map(ref_ => (
              <LibraryRefCard
                key={ref_.uuid}
                ref_={ref_}
                isSelected={selectedId === ref_.uuid}
                onSelect={() => setSelectedId(selectedId === ref_.uuid ? null : ref_.uuid)}
                onUpdateComment={(comment) => updateRef(ref_.uuid, { comment })}
                onDelete={() => deleteRef(ref_.uuid)}
              />
            ))}
            {markers.map(marker => (
              <MarkerCard
                key={marker.id}
                marker={marker}
                isSelected={selectedId === marker.id}
                onSelect={() => setSelectedId(selectedId === marker.id ? null : marker.id)}
                onUpdate={updates => updateMarker(marker.id, updates)}
                onDelete={() => deleteMarker(marker.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};
