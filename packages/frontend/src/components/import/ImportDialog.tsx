/**
 * The dialog shell around the import chooser, shared by the anonymous sidebar,
 * `/plans` and the sign-in flow: title, chooser, error, and the Cancel (or
 * *Not now*) and confirm buttons.
 */
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ImportChooser, type ImportChooserProps } from './ImportChooser';

export interface ImportDialogProps extends Partial<ImportChooserProps> {
  open: boolean;
  title: string;
  /** Shown above the chooser (e.g. the file name, or a replace warning). */
  intro?: React.ReactNode;
  /** Shown instead of the chooser while there is no preview (file picker, validating). */
  placeholder?: React.ReactNode;
  errors?: string[];
  busy?: boolean;
  confirmLabel: string;
  /** A destructive confirm (anonymous replace) is shown in red. */
  destructive?: boolean;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({
  open, title, intro, placeholder, errors = [], busy = false,
  confirmLabel, destructive = false, cancelLabel = 'Cancel', onConfirm, onCancel,
  preview, selection, onChange, tier = 'anonymous', planLocked = true,
}) => (
  <Dialog.Root open={open} onOpenChange={o => !o && !busy && onCancel()}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 bg-black/50" />
      <Dialog.Content
        aria-describedby={undefined}
        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-lg shadow-lg p-6 w-[440px] max-w-[90vw]"
      >
        <Dialog.Title className="text-base font-semibold mb-4">{title}</Dialog.Title>

        {intro && <div className="mb-3 text-sm text-gray-700 space-y-1">{intro}</div>}

        <div className="mb-4">
          {preview && selection && onChange ? (
            <ImportChooser
              preview={preview}
              selection={selection}
              onChange={onChange}
              tier={tier}
              planLocked={planLocked}
            />
          ) : placeholder}
        </div>

        {errors.length > 0 && (
          <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 space-y-1">
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !preview}
            className={`px-4 py-2 text-sm text-white rounded disabled:opacity-40 disabled:cursor-not-allowed ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-avio-primary hover:bg-avio-primary-hover'
            }`}
          >
            {busy ? 'Importing…' : confirmLabel}
          </button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
);

export default ImportDialog;
