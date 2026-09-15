import { useEffect, useRef } from 'react';

/**
 * Binds Ctrl/Cmd+Z to undo and Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y to redo.
 *
 * Registered above the maps rather than inside them, so it does not depend on
 * which map is mounted and does not compete with the existing global keydown
 * handlers in Map.tsx and LibraryMap.tsx.
 *
 * The shortcuts yield to anything that owns the keyboard: a focused editable
 * field keeps its native undo, and coord entry mode consumes keys for the
 * duration of an entry.
 */

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  // Also catches descendants of an editable region, and covers jsdom, which
  // does not implement isContentEditable.
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export type UndoShortcutOptions = {
  undo: () => void;
  redo: () => void;
  /** False while another mode owns the keyboard (e.g. coord entry). */
  enabled?: boolean;
};

export function useUndoShortcuts({ undo, redo, enabled = true }: UndoShortcutOptions): void {
  // Read the latest values from the listener without re-registering it.
  const ref = useRef({ undo, redo, enabled });
  ref.current = { undo, redo, enabled };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { undo: doUndo, redo: doRedo, enabled: isEnabled } = ref.current;

      if (!isEnabled) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) doRedo();
        else doUndo();
        return;
      }

      if (key === 'y') {
        event.preventDefault();
        doRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
