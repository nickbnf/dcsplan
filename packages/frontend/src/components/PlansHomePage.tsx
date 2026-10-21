import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { usePlanSelection } from '../contexts/PlanSelectionContext';
import { useSpaceAssets } from '../contexts/SpaceAssetsContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheatres } from '../hooks/useTheatres';
import { createPlan, deletePlan, type PlanSummary } from '../api/planApi';
import { planPath } from '../utils/planAddress';
import { ImportFlightPlanDialog } from './sidebar/ImportFlightPlanDialog';
import { LocalDataImportDialog } from './import/LocalDataImportDialog';
import { useOpenImportedPlan } from './import/useOpenImportedPlan';
import { importIntoSpace, spaceHeld } from '../import/spaceDestination';
import { readLocalData } from '../import/localSource';
import type { ImportSource } from '../import/types';

/**
 * Home screen (AD-15): the signed-in landing where plans are chosen, kept off the
 * editing surface. Selecting a plan opens it at its address (AD-16). Names are
 * read-only here — a plan is renamed only in its editor. The space switcher is
 * reserved (unrendered) until squadrons arrive.
 */

function formatEdited(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const NewPlanDialog: React.FC<{
  theatres: { id: string; name: string }[];
  onCreate: (theatre: string, name: string) => void;
}> = ({ theatres, onCreate }) => {
  const [open, setOpen] = useState(false);
  const [theatre, setTheatre] = useState('');
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && theatre.length > 0;

  const handleOpen = (next: boolean) => {
    if (next) {
      setTheatre(theatres[0]?.id ?? '');
      setName('');
    }
    setOpen(next);
  };

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate(theatre, trimmed);
    setOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpen}>
      <Dialog.Trigger asChild>
        <button className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-aero-label rounded bg-avio-primary text-white hover:bg-avio-primary-hover transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New plan
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Dialog.Content aria-describedby={undefined} className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw] z-[101]">
          <Dialog.Title className="text-lg font-semibold mb-4">New flight plan</Dialog.Title>
          <div className="mb-4">
            <label className="block text-sm font-aero-label text-gray-600 mb-2">Name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avio-primary focus:border-transparent"
              placeholder="Flight plan name"
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-aero-label text-gray-600 mb-2">Theatre</label>
            <select
              value={theatre}
              onChange={(e) => setTheatre(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-avio-primary focus:border-transparent"
            >
              {theatres.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            </Dialog.Close>
            <button
              className="px-4 py-2 text-sm bg-avio-primary text-white rounded hover:bg-avio-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleCreate}
              disabled={!canCreate}
            >
              Create
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const TRASH_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);

const PlanRow: React.FC<{
  plan: PlanSummary;
  theatreName: string;
  onSelect: () => void;
  onDelete: () => void;
  /** Why Delete is unavailable (offline), if it is. */
  deleteDisabledReason?: string;
}> = ({ plan, theatreName, onSelect, onDelete, deleteDisabledReason }) => (
  <li
    onClick={onSelect}
    className="group flex items-center justify-between px-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-avio-panel transition-colors"
  >
    <div className="min-w-0">
      <div className="text-sm font-medium text-gray-900 truncate">{plan.name}</div>
      <div className="text-xs text-gray-500">
        {theatreName}
        {plan.updatedAt ? ` · edited ${formatEdited(plan.updatedAt)}` : ''}
        {plan.lastEditor ? ` · ${plan.lastEditor}` : ''}
      </div>
    </div>
    <div className="flex items-center gap-1 pl-3 shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        disabled={deleteDisabledReason !== undefined}
        aria-label={`Delete ${plan.name}`}
        title={deleteDisabledReason ?? 'Delete plan'}
        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400"
      >
        {TRASH_ICON}
      </button>
      <span className="text-gray-400" aria-hidden>›</span>
    </div>
  </li>
);

/** Confirm moving a plan to the Trash (soft-delete). */
const DeletePlanDialog: React.FC<{
  plan: PlanSummary;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}> = ({ plan, onConfirm, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch {
      setError('The plan could not be deleted. Check your connection and try again.');
      setBusy(false);
    }
  };
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Dialog.Content aria-describedby="delete-plan-desc" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw] z-[101]">
          <Dialog.Title className="text-base font-semibold mb-3">Delete flight plan?</Dialog.Title>
          <p id="delete-plan-desc" className="text-sm text-gray-600 mb-4">
            "{plan.name}" moves to the Trash, where it can be restored for 30 days.
          </p>
          {error && <p role="alert" className="text-sm text-red-600 mb-4">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={busy}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const PlansHomePage: React.FC = () => {
  const { plans, newDraft, refreshPlans, notePlanGone } = usePlanSelection();
  const [deleting, setDeleting] = useState<PlanSummary | null>(null);
  const { sync, state: assets, status: assetStatus } = useSpaceAssets();
  const { connectivity } = useAuth();
  // Re-fetch whenever Home is shown, so renames made on other devices appear.
  // Offline, the list already held (or cached) is kept.
  useEffect(() => {
    refreshPlans().catch(() => {});
  }, [refreshPlans]);
  const { theatres } = useTheatres();
  const navigate = useNavigate();

  const theatreName = (id: string) => theatres.find((t) => t.id === id)?.name ?? id;
  const handleSelect = (p: PlanSummary) => navigate(planPath(p.id, p.name));
  const handleCreate = (theatre: string, name: string) => {
    const id = newDraft(theatre, name);
    navigate(planPath(id, name));
  };

  // Plan-file import (plan-import): adds a new plan to the space and opens it.
  // `assets` is read so the preview follows the space's library as it syncs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const held = useMemo(() => (sync ? spaceHeld(sync) : null), [sync, assets]);
  const offline = connectivity === 'offline' || assetStatus?.connectivity === 'offline';
  const openImported = useOpenImportedPlan();

  // Local data left on this device (declined at sign-in, or from before this
  // feature): offered until none remains (local-data-migration).
  const [localData, setLocalData] = useState<ImportSource | null>(null);
  const [localDialogOpen, setLocalDialogOpen] = useState(false);
  const recheckLocalData = useCallback(() => {
    readLocalData().then(setLocalData).catch(() => setLocalData(null));
  }, []);
  useEffect(() => {
    if (sync) recheckLocalData();
  }, [sync, recheckLocalData]);

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Space switcher row — reserved for squadrons (AD-15); unrendered for now. */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-sm font-aero-label uppercase tracking-wide text-gray-600">
            Your plans · Personal
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/trash')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-aero-label rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {TRASH_ICON}
              Trash
            </button>
            {sync && held && (
              <ImportFlightPlanDialog
                tier="signed-in"
                held={held}
                execute={(source, selection) => importIntoSpace(source, selection, {
                  sync,
                  createPlan,
                  listPlanIds: async () => (await refreshPlans()).map((p) => p.id),
                })}
                onDone={openImported}
                triggerClassName="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-aero-label rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                disabledReason={offline ? 'Importing a plan needs a connection' : undefined}
              />
            )}
            <NewPlanDialog theatres={theatres} onCreate={handleCreate} />
          </div>
        </div>

        {localData && (
          <div
            role="region"
            aria-label="Local data on this device"
            className="flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900"
          >
            <span>This device holds work from before you signed in.</span>
            <button
              onClick={() => setLocalDialogOpen(true)}
              className="shrink-0 px-3 py-1.5 text-sm font-aero-label rounded border border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            >
              Import local data from this device
            </button>
          </div>
        )}
        {localData && localDialogOpen && (
          <LocalDataImportDialog
            source={localData}
            onClose={() => { setLocalDialogOpen(false); recheckLocalData(); }}
            onAttempted={recheckLocalData}
          />
        )}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {plans.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              No plans yet. Create your first flight plan to get started.
            </div>
          ) : (
            <ul>
              {plans.map((p) => (
                <PlanRow
                  key={p.id}
                  plan={p}
                  theatreName={theatreName(p.theatre)}
                  onSelect={() => handleSelect(p)}
                  onDelete={() => setDeleting(p)}
                  deleteDisabledReason={offline ? 'Deleting a plan needs a connection' : undefined}
                />
              ))}
            </ul>
          )}
        </div>
        {deleting && (
          <DeletePlanDialog
            plan={deleting}
            onConfirm={async () => {
              await deletePlan(deleting.id);
              notePlanGone(deleting.id);
            }}
            onClose={() => setDeleting(null)}
          />
        )}
      </div>
    </div>
  );
};

export default PlansHomePage;
