/**
 * Undo history core — pure logic, no React.
 *
 * Holds snapshots of an entity's state taken *before* each user action, so a
 * later undo can restore them. In-memory and session-scoped by design: it is
 * never persisted and never reaches a server (AD-12).
 *
 * Consecutive pushes that share a non-empty `coalesceKey` within
 * `COALESCE_WINDOW_MS` merge into the existing entry, so sustained interaction
 * with one control (dragging a slider) collapses to a single undoable action
 * while distinct actions stay distinct.
 */

export const DEFAULT_DEPTH = 50;
export const COALESCE_WINDOW_MS = 500;

export type UndoEntry<T> = {
  /** The state as it was immediately before the action this entry represents. */
  before: T;
  /** Identifies the control being manipulated; absent means "never coalesce". */
  coalesceKey?: string;
  /** Timestamp of the most recent push folded into this entry. */
  at: number;
  /** Optional short description, surfaced when undoing across pages. */
  label?: string;
};

export type UndoHistory<T> = {
  past: UndoEntry<T>[];
  future: T[];
  depth: number;
};

export type PushOptions = {
  coalesceKey?: string;
  label?: string;
  /** Injectable clock, so tests need not depend on wall time. */
  now?: number;
};

export function createHistory<T>(depth: number = DEFAULT_DEPTH): UndoHistory<T> {
  return { past: [], future: [], depth };
}

export function canUndo<T>(history: UndoHistory<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: UndoHistory<T>): boolean {
  return history.future.length > 0;
}

/**
 * Records `before` as the state to return to. Any redo history is discarded,
 * since the timeline has branched.
 */
export function push<T>(
  history: UndoHistory<T>,
  before: T,
  options: PushOptions = {}
): UndoHistory<T> {
  const { coalesceKey, label } = options;
  const now = options.now ?? Date.now();

  const previous = history.past[history.past.length - 1];
  const shouldCoalesce =
    !!coalesceKey &&
    !!previous &&
    previous.coalesceKey === coalesceKey &&
    now - previous.at <= COALESCE_WINDOW_MS;

  if (shouldCoalesce) {
    // Keep the *earliest* `before` so one undo reverses the whole interaction;
    // only the timestamp advances, extending the coalescing window.
    const merged: UndoEntry<T> = { ...previous, at: now };
    return {
      ...history,
      past: [...history.past.slice(0, -1), merged],
      future: [],
    };
  }

  const entry: UndoEntry<T> = { before, at: now, ...(coalesceKey ? { coalesceKey } : {}), ...(label ? { label } : {}) };
  const past = [...history.past, entry];

  return {
    ...history,
    past: past.length > history.depth ? past.slice(past.length - history.depth) : past,
    future: [],
  };
}

export type UndoResult<T> = { history: UndoHistory<T>; state: T; label?: string } | null;

/** Returns null when there is nothing to undo, leaving the caller's state alone. */
export function undo<T>(history: UndoHistory<T>, current: T): UndoResult<T> {
  const entry = history.past[history.past.length - 1];
  if (!entry) return null;

  return {
    history: {
      ...history,
      past: history.past.slice(0, -1),
      future: [...history.future, current],
    },
    state: entry.before,
    ...(entry.label ? { label: entry.label } : {}),
  };
}

/** Returns null when there is nothing to redo. */
export function redo<T>(history: UndoHistory<T>, current: T): UndoResult<T> {
  const next = history.future[history.future.length - 1];
  if (next === undefined) return null;

  return {
    history: {
      ...history,
      past: [...history.past, { before: current, at: Date.now() }],
      future: history.future.slice(0, -1),
    },
    state: next,
  };
}

/** Drops everything. Used by wholesale-replacement operations (AD-12). */
export function clearHistory<T>(history: UndoHistory<T>): UndoHistory<T> {
  return { ...history, past: [], future: [] };
}
