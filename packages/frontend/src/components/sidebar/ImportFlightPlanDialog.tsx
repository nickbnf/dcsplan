/**
 * Import a flight-plan file (capability: plan-import): pick a file, validate
 * it, choose what to bring in, then hand the selection to a destination.
 *
 * Anonymous (plan sidebar): the import replaces the single plan. Signed in
 * (`/plans`): it adds a new plan to the space. The destination is supplied by
 * the host, so this component knows neither tier's stores.
 */
import React, { useMemo, useRef, useState } from 'react';
import { ImportDialog } from '../import/ImportDialog';
import { computePreview } from '../../import/preview';
import { ImportFileError, readPlanFile } from '../../import/fileSource';
import { SELECT_ALL, type HeldAssets, type ImportOutcome, type ImportSelection, type ImportSource } from '../../import/types';
import { generatePlanId } from '../../utils/planId';

interface ImportFlightPlanDialogProps {
  tier: 'anonymous' | 'signed-in';
  /** What the destination already holds, for the preview. */
  held: HeldAssets;
  /** Run the import against the destination. */
  execute: (source: ImportSource, selection: ImportSelection) => ImportOutcome | Promise<ImportOutcome>;
  /** Called after an import whose plan was imported. */
  onDone?: (outcome: ImportOutcome) => void;
  triggerLabel?: string;
  triggerClassName?: string;
  /** Disable the trigger, with a hint (signed in while offline, D9). */
  disabledReason?: string;
}

const DEFAULT_TRIGGER_CLASS =
  'px-2.5 py-1.5 text-xs font-aero-label rounded border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

export const ImportFlightPlanDialog: React.FC<ImportFlightPlanDialogProps> = ({
  tier,
  held,
  execute,
  onDone,
  triggerLabel = 'Import',
  triggerClassName = DEFAULT_TRIGGER_CLASS,
  disabledReason,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [selection, setSelection] = useState<ImportSelection>(SELECT_ALL);
  const [errors, setErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preview = useMemo(() => (source ? computePreview(source, held) : undefined), [source, held]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSource(null);
    setSelection(SELECT_ALL);
    setErrors([]);
    setIsValidating(true);
    try {
      setSource(await readPlanFile(await file.text()));
    } catch (err) {
      setErrors([err instanceof ImportFileError || err instanceof Error ? err.message : 'Failed to validate flight plan.']);
    } finally {
      setIsValidating(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setFileName(null);
    setSource(null);
    setSelection(SELECT_ALL);
    setErrors([]);
    setIsValidating(false);
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirm = async () => {
    if (!source) return;
    // The plan id lives as long as the dialog, so a retry reuses it (D4).
    const attempt = source.planId ? source : { ...source, planId: generatePlanId() };
    setSource(attempt);
    setBusy(true);
    setErrors([]);
    try {
      const outcome = await execute(attempt, { ...selection, plan: true });
      if (outcome.plan === 'failed') {
        setErrors([outcome.error ?? 'The plan could not be imported. Try again.']);
        setBusy(false);
        return;
      }
      handleClose();
      onDone?.(outcome);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'The plan could not be imported.']);
      setBusy(false);
    }
  };

  const anonymous = tier === 'anonymous';

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
      <button
        onClick={() => setIsOpen(true)}
        disabled={Boolean(disabledReason)}
        title={disabledReason}
        className={triggerClassName}
      >
        <span aria-hidden>⬆</span> {triggerLabel}
      </button>

      <ImportDialog
        open={isOpen}
        title={anonymous ? 'Replace flight plan?' : 'Import flight plan'}
        intro={fileName && (
          <>
            <div><span className="text-gray-500">File:</span> {fileName}</div>
            {anonymous && source && <div className="text-amber-700">Your current flight plan will be replaced.</div>}
          </>
        )}
        placeholder={
          !fileName ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border border-dashed border-gray-300 rounded px-4 py-3 text-sm text-gray-500 hover:bg-gray-50"
            >
              Select a .json file
            </button>
          ) : isValidating ? (
            <p className="text-sm text-gray-500">Validating {fileName}…</p>
          ) : null
        }
        preview={preview}
        selection={selection}
        onChange={setSelection}
        tier={tier}
        planLocked
        errors={errors}
        busy={busy}
        confirmLabel={anonymous ? 'Replace' : 'Import'}
        destructive={anonymous}
        onConfirm={handleConfirm}
        onCancel={handleClose}
      />
    </>
  );
};
