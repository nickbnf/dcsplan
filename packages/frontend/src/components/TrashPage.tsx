import React, { useCallback, useEffect, useState } from 'react';
import { canRestore, getMySpace, getTrash, restorePlan, type TrashContents } from '../api/planApi';
import { restoreEntry, restoreProfile } from '../api/assetApi';
import { usePlanSelection } from '../contexts/PlanSelectionContext';
import { useSpaceAssets } from '../contexts/SpaceAssetsContext';
import { useAuth } from '../contexts/AuthContext';
import { useTheatres } from '../hooks/useTheatres';
import { getPictogramDef } from '../utils/pictogramCatalog';
import { profileLabel } from '../types/flightPlan';

/**
 * The space's Trash (capability: soft-delete; AD-7): deleted plans, library
 * entries and profiles, newest deletion first, until they are purged. The space
 * admin restores an item unchanged; other members only see the list. Reading
 * and restoring need a connection.
 */

type Kind = 'plan' | 'entry' | 'profile';

interface TrashRow {
  key: string;
  kind: Kind;
  name: string;
  detail: string | null;
  deletedAt: string;
  restore: () => Promise<void>;
}

const KIND_LABEL: Record<Kind, string> = {
  plan: 'Flight plan',
  entry: 'Library object',
  profile: 'Profile',
};

function entryName(name: string | undefined, type: Parameters<typeof getPictogramDef>[0]): string {
  if (name) return name;
  try {
    return getPictogramDef(type).label;
  } catch {
    return 'Unnamed object';
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const TrashPage: React.FC = () => {
  const { connectivity } = useAuth();
  const { sync, status: assetStatus } = useSpaceAssets();
  const { notePlanCreated } = usePlanSelection();
  const { theatres } = useTheatres();
  const offline = connectivity === 'offline' || assetStatus?.connectivity === 'offline';

  const [contents, setContents] = useState<TrashContents | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [trash, space] = await Promise.all([getTrash(), getMySpace()]);
      setContents(trash);
      setRole(space.role ?? null);
      setError(null);
    } catch {
      setError('The Trash could not be loaded. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    if (!offline) void load();
  }, [offline, load]);

  const theatreName = (id: string) => theatres.find((t) => t.id === id)?.name ?? id;

  const rows: TrashRow[] = contents ? [
    ...contents.plans.map((p): TrashRow => ({
      key: `plan:${p.id}`, kind: 'plan', name: p.name, detail: theatreName(p.theatre), deletedAt: p.deletedAt,
      restore: async () => notePlanCreated(await restorePlan(p.id)),
    })),
    ...contents.entries.map((e): TrashRow => ({
      key: `entry:${e.id}`, kind: 'entry',
      name: entryName(e.entry.name, e.entry.type),
      detail: theatreName(e.theatre), deletedAt: e.deletedAt,
      restore: async () => { await restoreEntry(e.libraryId, e.id); await sync?.pull(); },
    })),
    ...contents.profiles.map((p): TrashRow => ({
      key: `profile:${p.id}`, kind: 'profile', name: profileLabel(p.profile.aircraft), detail: null,
      deletedAt: p.deletedAt,
      restore: async () => { await restoreProfile(p.id); await sync?.pull(); },
    })),
  ].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)) : [];

  const [restoring, setRestoring] = useState<string | null>(null);
  const restore = async (row: TrashRow) => {
    setRestoring(row.key);
    try {
      await row.restore();
      setError(null);
      await load();
    } catch {
      setError(`"${row.name}" could not be restored. Check your connection and try again.`);
    } finally {
      setRestoring(null);
    }
  };

  const mayRestore = canRestore(role);

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="mb-4">
          <h1 className="text-sm font-aero-label uppercase tracking-wide text-gray-600">Trash · Personal</h1>
          <p className="text-xs text-gray-500 mt-1">
            Deleted items are removed for good {contents?.retentionDays ?? 30} days after deletion.
          </p>
        </div>

        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {offline ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">
              The Trash needs a connection. It will be shown once you are back online.
            </div>
          ) : contents === null ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">{error ? '' : 'Loading…'}</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-gray-500">The Trash is empty.</div>
          ) : (
            <ul>
              {rows.map((row) => (
                <li key={row.key} className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{row.name}</div>
                    <div className="text-xs text-gray-500">
                      {KIND_LABEL[row.kind]}
                      {row.detail ? ` · ${row.detail}` : ''}
                      {` · deleted ${formatDate(row.deletedAt)}`}
                    </div>
                  </div>
                  {mayRestore && (
                    <button
                      onClick={() => void restore(row)}
                      disabled={restoring !== null}
                      aria-label={`Restore ${row.name}`}
                      className="shrink-0 ml-3 px-3 py-1.5 text-sm font-aero-label rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Restore
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrashPage;
