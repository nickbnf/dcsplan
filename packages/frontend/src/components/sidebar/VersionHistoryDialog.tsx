import React, { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useOptionalFlightPlan } from '../../contexts/FlightPlanContext';
import { useAuth } from '../../contexts/AuthContext';
import { formatEditors, listVersions, type PlanVersions, type PlanVersion } from '../../api/planApi';

const actionButtonClass =
  'px-2.5 py-1.5 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors';

/** A version's finalization time in the viewer's local time, e.g. `23 Jul 14:32`. */
function formatLocalTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function versionLabel(version: PlanVersion): string {
  return `Rev ${version.rev} · ${formatLocalTime(version.finalizedAt)} · ${formatEditors(version.editors)}`;
}

const RESTORE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
  </svg>
);

type Listing =
  | { state: 'loading' }
  | { state: 'offline' }
  | { state: 'error'; message: string }
  | { state: 'ready'; data: PlanVersions };

/**
 * The open plan's version history (capability: version-history; add-version-history
 * D10): a History button beside Undo/Redo opening the versions, newest first,
 * each restorable after a confirmation. Signed-in, synced plans only; renders
 * nothing otherwise.
 */
export const VersionHistoryDialog: React.FC = () => {
  const flightPlan = useOptionalFlightPlan();
  const { connectivity } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [listing, setListing] = useState<Listing>({ state: 'loading' });
  const [confirming, setConfirming] = useState<PlanVersion | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const planId = flightPlan?.flightPlanId;
  const restoreVersion = flightPlan?.restoreVersion;
  const offline = connectivity === 'offline';

  useEffect(() => {
    if (!isOpen || !planId) return;
    if (offline) {
      setListing({ state: 'offline' });
      return;
    }
    let cancelled = false;
    setListing({ state: 'loading' });
    listVersions(planId).then(
      data => { if (!cancelled) setListing({ state: 'ready', data }); },
      err => {
        if (cancelled) return;
        // fetch rejects with a TypeError when the server cannot be reached.
        if (err instanceof TypeError) setListing({ state: 'offline' });
        else setListing({ state: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => { cancelled = true; };
  }, [isOpen, planId, offline]);

  if (!restoreVersion) return null;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setConfirming(null);
      setRestoreError(null);
    }
  };

  const handleRestore = async () => {
    if (!confirming) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      await restoreVersion(confirming.rev);
      handleOpenChange(false);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Failed to restore the version');
    } finally {
      setIsRestoring(false);
    }
  };

  const renderList = () => {
    if (listing.state === 'loading') {
      return <p className="text-sm text-gray-500">Loading versions…</p>;
    }
    if (listing.state === 'offline') {
      return (
        <p className="text-sm text-gray-600" role="status">
          Version history is unavailable offline. Versions can be listed and restored once the connection returns.
        </p>
      );
    }
    if (listing.state === 'error') {
      return <p className="text-sm text-red-600" role="alert">{listing.message}</p>;
    }
    const { versions, pending } = listing.data;
    return (
      <div className="space-y-3">
        {pending && (
          <p className="text-xs font-aero-label text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2" data-testid="pending-changes">
            {versions.length > 0
              ? `Changes since Rev ${versions[0].rev} not yet saved as a version`
              : 'Changes not yet saved as a version'}
          </p>
        )}
        {versions.length === 0 && !pending && (
          <p className="text-sm text-gray-500">No versions yet.</p>
        )}
        <ol className="max-h-80 overflow-y-auto -mx-2">
          {versions.map((version, index) => {
            // Restoring the current version would change nothing.
            const isCurrent = index === 0 && !pending;
            return (
              <li
                key={version.rev}
                className={`group flex items-center gap-3 rounded px-2 py-2 ${isCurrent ? 'bg-avio-panel' : 'hover:bg-gray-50'}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold font-aero-label text-gray-900">Rev {version.rev}</span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wide font-aero-label text-avio-primary border border-avio-primary rounded px-1.5 py-px">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate" data-testid="version-detail">
                    {formatLocalTime(version.finalizedAt)} · {formatEditors(version.editors)}
                    {version.restoredFrom !== null && ` · restored from Rev ${version.restoredFrom}`}
                  </div>
                </div>
                {!isCurrent && (
                  <button
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-aero-label rounded text-avio-primary hover:bg-avio-panel hover:text-avio-primary-hover transition-colors opacity-70 group-hover:opacity-100 focus:opacity-100"
                    onClick={() => setConfirming(version)}
                    aria-label={`Restore Rev ${version.rev}`}
                  >
                    {RESTORE_ICON}
                    Restore
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    );
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button className={actionButtonClass} title="Version history">
          History
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[100]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg w-[28rem] max-w-[90vw] z-[101] overflow-hidden"
        >
          <header className="px-6 py-4 border-b border-gray-200">
            <Dialog.Title className="text-lg font-semibold">
              {confirming ? `Restore Rev ${confirming.rev}?` : 'Version history'}
            </Dialog.Title>
          </header>

          <div className="px-6 py-4">
            {confirming ? (
              <div className="space-y-2 text-sm text-gray-600">
                <p>
                  The plan returns to the waypoints, settings, comments and references of{' '}
                  <span className="font-aero-label text-gray-800">{versionLabel(confirming)}</span>.
                  Threats and the profile it references show as they are now.
                </p>
                <p>Its current state is kept as a version first, so you can come back to it.</p>
                {restoreError && <p className="text-red-600" role="alert">{restoreError}</p>}
              </div>
            ) : (
              renderList()
            )}
          </div>

          <footer className="flex justify-end gap-2 px-6 py-3 bg-gray-50 border-t border-gray-200">
            {confirming ? (
              <>
                <button
                  className="px-4 py-2 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50"
                  onClick={() => { setConfirming(null); setRestoreError(null); }}
                  disabled={isRestoring}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 text-sm bg-avio-primary text-white rounded hover:bg-avio-primary-hover disabled:opacity-50"
                  onClick={handleRestore}
                  disabled={isRestoring || offline}
                >
                  {isRestoring ? 'Restoring…' : `Restore Rev ${confirming.rev}`}
                </button>
              </>
            ) : (
              <Dialog.Close asChild>
                <button className="px-4 py-2 text-sm border border-gray-300 rounded bg-white hover:bg-gray-50">
                  Close
                </button>
              </Dialog.Close>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
