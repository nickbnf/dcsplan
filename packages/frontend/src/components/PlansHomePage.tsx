import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Dialog from '@radix-ui/react-dialog';
import { usePlanSelection } from '../contexts/PlanSelectionContext';
import { useTheatres } from '../hooks/useTheatres';
import type { PlanSummary } from '../api/planApi';

/**
 * Home screen (AD-15): the signed-in landing where plans are chosen and managed,
 * kept off the editing surface. Selecting a plan makes it active and opens NAV.
 * The space switcher is reserved (unrendered) until squadrons arrive.
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
  existingNames: string[];
  onCreate: (theatre: string, name: string) => void;
}> = ({ theatres, existingNames, onCreate }) => {
  const [open, setOpen] = useState(false);
  const [theatre, setTheatre] = useState('');
  const [name, setName] = useState('');

  const trimmed = name.trim();
  const collides = existingNames.some((n) => n === trimmed);
  const canCreate = trimmed.length > 0 && !collides && theatre.length > 0;

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
            {collides && (
              <p className="mt-1 text-xs text-red-600">Name must be unique.</p>
            )}
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

const PlanRow: React.FC<{
  plan: PlanSummary;
  theatreName: string;
  otherNames: string[];
  onSelect: () => void;
  onRename: (name: string) => void;
}> = ({ plan, theatreName, otherNames, onSelect, onRename }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.name);

  const trimmed = name.trim();
  const collides = otherNames.some((n) => n === trimmed);
  const canSave = trimmed.length > 0 && !collides && trimmed !== plan.name;

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setName(plan.name);
    setEditing(true);
  };
  const save = () => {
    if (canSave) onRename(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <div className="flex-1">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-avio-primary"
          />
          {collides && <p className="mt-1 text-xs text-red-600">Name must be unique.</p>}
        </div>
        <button
          onClick={save}
          disabled={!canSave}
          className="px-2.5 py-1 text-xs font-aero-label rounded bg-avio-primary text-white hover:bg-avio-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Save
        </button>
        <button onClick={() => setEditing(false)} className="px-2.5 py-1 text-xs rounded border border-gray-300 hover:bg-gray-50">
          Cancel
        </button>
      </li>
    );
  }

  return (
    <li
      onClick={onSelect}
      className="flex items-center justify-between px-4 py-3 border-b border-gray-200 cursor-pointer hover:bg-avio-panel transition-colors"
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{plan.name}</div>
        <div className="text-xs text-gray-500">
          {theatreName}
          {plan.updatedAt ? ` · edited ${formatEdited(plan.updatedAt)}` : ''}
          {plan.lastEditor ? ` · ${plan.lastEditor}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-3 pl-3 shrink-0">
        <button
          onClick={startEdit}
          className="text-xs text-gray-500 hover:text-avio-primary font-aero-label"
          aria-label={`Rename ${plan.name}`}
        >
          Rename
        </button>
        <span className="text-gray-400" aria-hidden>›</span>
      </div>
    </li>
  );
};

const PlansHomePage: React.FC = () => {
  const { plans, selectPlan, newDraft, renamePlan } = usePlanSelection();
  const { theatres } = useTheatres();
  const navigate = useNavigate();

  const theatreName = (id: string) => theatres.find((t) => t.id === id)?.name ?? id;
  const allNames = useMemo(() => plans.map((p) => p.name), [plans]);

  const handleSelect = (id: string) => {
    selectPlan(id);
    navigate('/');
  };
  const handleCreate = (theatre: string, name: string) => {
    newDraft(theatre, name);
    navigate('/');
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Space switcher row — reserved for squadrons (AD-15); unrendered for now. */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-sm font-aero-label uppercase tracking-wide text-gray-600">
            Your plans · Personal
          </h1>
          <NewPlanDialog theatres={theatres} existingNames={allNames} onCreate={handleCreate} />
        </div>

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
                  otherNames={allNames.filter((n) => n !== p.name)}
                  onSelect={() => handleSelect(p.id)}
                  onRename={(name) => renamePlan(p.id, name)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlansHomePage;
