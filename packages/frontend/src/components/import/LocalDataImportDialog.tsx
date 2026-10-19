/**
 * The chooser for this device's local data (capability: local-data-migration),
 * opened on sign-in to an account that holds data, and from `/plans`.
 */
import React, { useMemo, useState } from 'react';
import { ImportDialog } from './ImportDialog';
import { useOpenImportedPlan } from './useOpenImportedPlan';
import { usePlanSelection } from '../../contexts/PlanSelectionContext';
import { useSpaceAssets } from '../../contexts/SpaceAssetsContext';
import { createPlan } from '../../api/planApi';
import { computePreview } from '../../import/preview';
import { spaceHeld } from '../../import/spaceDestination';
import { fullySucceeded, importLocalData } from '../../import/localImport';
import { readLocalData } from '../../import/localSource';
import { SELECT_ALL, type ImportOutcome, type ImportSelection, type ImportSource } from '../../import/types';

interface LocalDataImportDialogProps {
  source: ImportSource;
  /** "Not now" at sign-in, "Cancel" from `/plans`. */
  cancelLabel?: string;
  onClose: () => void;
  /** Called after each attempt, so the host can re-read what is left. */
  onAttempted?: (outcome: ImportOutcome) => void;
}

export const LocalDataImportDialog: React.FC<LocalDataImportDialogProps> = ({
  source: initialSource,
  cancelLabel = 'Cancel',
  onClose,
  onAttempted,
}) => {
  const { sync, state: assets } = useSpaceAssets();
  const { refreshPlans } = usePlanSelection();
  const openImported = useOpenImportedPlan();
  const [source, setSource] = useState(initialSource);
  const [selection, setSelection] = useState<ImportSelection>(SELECT_ALL);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const preview = useMemo(() => (sync ? computePreview(source, spaceHeld(sync)) : undefined), [sync, assets, source]);

  const handleConfirm = async () => {
    if (!sync) return;
    setBusy(true);
    setErrors([]);
    let reason: string;
    try {
      const outcome = await importLocalData(source, selection, {
        sync,
        createPlan,
        listPlanIds: async () => (await refreshPlans()).map(p => p.id),
      });
      onAttempted?.(outcome);
      if (fullySucceeded(outcome)) {
        onClose();
        openImported(outcome);
        return;
      }
      reason = outcome.error ?? 'the server could not be reached';
    } catch (err) {
      reason = err instanceof Error ? err.message : String(err);
    }
    // Keep the dialog open on what is left; what was accepted has moved.
    const remaining = await readLocalData().catch(() => null);
    setBusy(false);
    setErrors([`Some of your local data was not imported: ${reason}. It is still on this device; try again.`]);
    if (remaining) setSource(remaining);
    else onClose();
  };

  return (
    <ImportDialog
      open
      title="Import local data from this device"
      intro={<div>This device holds work from before you signed in. Choose what to add to your account; it moves there and leaves this device.</div>}
      preview={preview}
      selection={selection}
      onChange={setSelection}
      tier="signed-in"
      planLocked={false}
      errors={errors}
      busy={busy}
      confirmLabel="Import"
      cancelLabel={cancelLabel}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
};
