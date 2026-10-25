import React, { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useFlightPlan } from '../../contexts/FlightPlanContext';
import { usePerformance } from '../../contexts/PerformanceContext';
import { countBoundLegs, switchPlanProfile } from '../../utils/regimeUtils';
import { profileLabel } from '../../types/flightPlan';
import PerformanceImportDialog from '../PerformanceImportDialog';
import { ReferenceCountNotice } from '../ReferenceCountNotice';
import { useSpaceAssets } from '../../contexts/SpaceAssetsContext';

// The bound-leg warning shared by switching and deleting the flown profile
// (performance-profile: same wording for both).
export function boundLegsMessage(count: number): string {
  return `${count} leg${count !== 1 ? 's are' : ' is'} bound to regimes in this profile. ` +
    `Switching will set ${count !== 1 ? 'them' : 'it'} to Manual. Their TAS and fuel flow are kept.`;
}

interface ConfirmProps {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmProps> = ({ title, message, confirmLabel, cancelLabel = 'Cancel', destructive, onConfirm, onCancel }) => (
  <Dialog.Root open onOpenChange={open => !open && onCancel()}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content aria-describedby="confirm-desc" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-96 max-w-[90vw]">
        <Dialog.Title className="text-base font-semibold mb-3">{title}</Dialog.Title>
        <p id="confirm-desc" className="text-sm text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm text-white rounded ${destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-avio-primary hover:opacity-90'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

const NONE = '';

/**
 * Plan-scoped header band: which profile the active plan flies (signed-in).
 * Changing it clears the legs bound to the current profile, after confirmation
 * when any are bound (performance-profile; design D10a). A confirmed switch
 * first finalizes the open session into a version, so the bindings it clears
 * stay restorable (version-history; add-version-history D9).
 */
export const PlanProfileHeader: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate, finalizeVersion } = useFlightPlan();
  const { profiles, flownProfileId, performance } = usePerformance();
  const { sync, status } = useSpaceAssets();
  const [pending, setPending] = useState<string | null | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  // The plan as of the latest render: a switch applied after saving a version
  // must not undo edits that arrived meanwhile.
  const latest = useRef({ flightPlan, performance });
  latest.current = { flightPlan, performance };

  // The plan names a profile that no longer resolves because it was deleted
  // (trashed or purged), not merely not synced yet (soft-delete).
  const missingId = flightPlan.profileId && !flownProfileId ? flightPlan.profileId : null;
  const deleted = missingId !== null && sync?.profileStatus(missingId) === 'deleted';
  const restorable = deleted && sync!.isTrashed('profile', missingId!);

  const apply = (id: string | null) => {
    onFlightPlanUpdate(switchPlanProfile(latest.current.flightPlan, latest.current.performance, id));
    setPending(undefined);
  };

  // Connected: save a version first. Disconnected, or if saving fails, switch
  // anyway: the edits join the session once they reach the server, and undo
  // still covers the switch.
  const confirmSwitch = async (id: string | null) => {
    if (!finalizeVersion || status?.connectivity === 'offline') {
      apply(id);
      return;
    }
    setIsSaving(true);
    try {
      await finalizeVersion();
    } catch {
      /* switch anyway (design D9) */
    } finally {
      setIsSaving(false);
    }
    apply(id);
  };

  const choose = (value: string) => {
    const id = value === NONE ? null : value;
    if (id === flownProfileId) return;
    if (countBoundLegs(flightPlan, performance) > 0) setPending(id);
    else apply(id);
  };

  return (
    <section
      aria-label="Profile this plan flies"
      data-testid="plan-profile-header"
      className="bg-avio-panel border-b-2 border-avio-primary px-6 py-2 flex items-center gap-3 shrink-0"
    >
      <span className="text-xs font-aero-label uppercase tracking-wide text-avio-primary">This plan flies</span>
      <select
        aria-label="This plan flies"
        value={flownProfileId ?? NONE}
        onChange={e => choose(e.target.value)}
        className="text-sm font-aero-mono border border-gray-300 rounded px-2 py-0.5 bg-white"
      >
        <option value={NONE}>{deleted ? 'Deleted profile (manual legs)' : 'No profile (manual legs)'}</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{profileLabel(p.aircraft)}</option>)}
      </select>
      {deleted && (
        <span role="status" className="text-xs text-amber-700">
          This plan's profile was deleted
          {restorable ? ' and can be restored from the Trash' : ''}. Choose another profile.
        </span>
      )}
      {pending !== undefined && (
        <ConfirmDialog
          title="Switch profile?"
          message={boundLegsMessage(countBoundLegs(flightPlan, performance))}
          confirmLabel={isSaving ? 'Switching…' : 'Switch'}
          onConfirm={() => { if (!isSaving) void confirmSwitch(pending); }}
          onCancel={() => setPending(undefined)}
        />
      )}
    </section>
  );
};

/**
 * Space-scoped profile list (signed-in): every profile by its label, the
 * edited one in bold, the flown one tagged. Selecting one only changes what
 * is edited, never what the plan flies (design D10a).
 */
export const ProfileSidebar: React.FC = () => {
  const { profiles, editingProfileId, setEditingProfileId, createProfile, flownProfileId } = usePerformance();
  const [showImport, setShowImport] = useState(false);

  return (
    <nav aria-label="Profiles" className="w-56 shrink-0 bg-gray-100 border-r border-gray-300 flex flex-col">
      <h2 className="px-3 pt-3 pb-2 text-xs font-aero-label uppercase tracking-wide text-gray-500">Profiles</h2>
      <ul className="flex-1 overflow-y-auto">
        {profiles.map(p => {
          const editing = p.id === editingProfileId;
          const ac = p.aircraft;
          return (
            <li key={p.id}>
              <button
                aria-current={editing ? 'true' : undefined}
                onClick={() => setEditingProfileId(p.id)}
                className={`w-full text-left px-3 py-2 text-sm font-aero-label border-l-4 ${
                  editing ? 'font-bold bg-white border-avio-primary' : 'border-transparent hover:bg-gray-200'
                }`}
              >
                <span className="flex items-center gap-1">
                  <span className="truncate">{ac.model.trim() || profileLabel(ac)}</span>
                  {p.id === flownProfileId && (
                    <span className="ml-auto shrink-0 text-[10px] font-semibold px-1 rounded bg-blue-100 text-avio-primary">FLOWN</span>
                  )}
                </span>
                {ac.model.trim() && (
                  <span className="block truncate text-xs font-normal text-gray-500">
                    {ac.takeoffConfiguration.trim() || 'no T/O config'}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-gray-300 px-3 py-2 flex gap-3 text-xs font-aero-label">
        <button onClick={() => createProfile()} className="text-blue-600 hover:text-blue-800">+ New</button>
        <button onClick={() => setShowImport(true)} className="text-blue-600 hover:text-blue-800">⬆ Import</button>
      </div>
      {showImport && <PerformanceImportDialog onClose={() => setShowImport(false)} />}
    </nav>
  );
};

/**
 * Delete the edited profile (signed-in): it moves to the Trash. No plan is
 * edited, the open one included: plans flying it keep their `profileId` and
 * regime bindings, compute as Manual while it is trashed, and are whole again
 * if it is restored (soft-delete). The confirmation states how many plans fly it.
 */
export const DeleteProfileButton: React.FC = () => {
  const { editingProfileId, editingAircraft, deleteProfile } = usePerformance();
  const [confirm, setConfirm] = useState(false);
  if (!editingProfileId) return null;

  const doDelete = () => {
    deleteProfile(editingProfileId);
    setConfirm(false);
  };

  return (
    <>
      <button
        onClick={() => setConfirm(true)}
        className="text-xs font-aero-label text-red-500 hover:text-red-700 transition-colors"
      >
        Delete
      </button>
      {confirm && (
        <ConfirmDialog
          title="Delete profile?"
          message={
            <>
              "{profileLabel(editingAircraft)}" will move to the Trash, where it can be restored for 30 days.
              <ReferenceCountNotice kind="profile" id={editingProfileId} />
            </>
          }
          confirmLabel="Delete"
          destructive
          onConfirm={doDelete}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  );
};
