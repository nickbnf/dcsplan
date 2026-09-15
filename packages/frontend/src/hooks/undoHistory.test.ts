import { describe, it, expect } from 'vitest';
import {
  createHistory,
  push,
  undo,
  redo,
  clearHistory,
  canUndo,
  canRedo,
  COALESCE_WINDOW_MS,
} from './undoHistory';

/** Applies a sequence of edits, pushing the pre-edit state each time. */
function pushAll(states: string[], opts: { coalesceKey?: string; now?: number }[] = []) {
  let history = createHistory<string>();
  states.forEach((before, i) => {
    history = push(history, before, opts[i] ?? {});
  });
  return history;
}

describe('undoHistory — linear undo and redo', () => {
  it('starts empty', () => {
    const history = createHistory<string>();
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it('undo restores the state captured before the edit', () => {
    const history = pushAll(['S0']);
    const result = undo(history, 'S1');
    expect(result?.state).toBe('S0');
  });

  it('returns null when there is nothing to undo', () => {
    expect(undo(createHistory<string>(), 'S1')).toBeNull();
  });

  it('returns null when there is nothing to redo', () => {
    expect(redo(createHistory<string>(), 'S1')).toBeNull();
  });

  it('repeated undo walks back through successive edits', () => {
    const history = pushAll(['S0', 'S1']);

    const first = undo(history, 'S2');
    expect(first?.state).toBe('S1');

    const second = undo(first!.history, first!.state);
    expect(second?.state).toBe('S0');
    expect(canUndo(second!.history)).toBe(false);
  });

  it('redo reapplies the reversed edit', () => {
    const history = pushAll(['S0']);
    const undone = undo(history, 'S1')!;

    const redone = redo(undone.history, undone.state);
    expect(redone?.state).toBe('S1');
  });

  it('undo then redo round-trips through several edits', () => {
    let history = pushAll(['S0', 'S1']);

    const u1 = undo(history, 'S2')!;
    const u2 = undo(u1.history, u1.state)!;
    expect(u2.state).toBe('S0');

    const r1 = redo(u2.history, u2.state)!;
    expect(r1.state).toBe('S1');
    const r2 = redo(r1.history, r1.state)!;
    expect(r2.state).toBe('S2');
    expect(canRedo(r2.history)).toBe(false);
  });

  it('a new edit discards the redo history', () => {
    const history = pushAll(['S0']);
    const undone = undo(history, 'S1')!;
    expect(canRedo(undone.history)).toBe(true);

    const branched = push(undone.history, 'S0');
    expect(canRedo(branched)).toBe(false);
  });

  it('clearHistory drops both directions', () => {
    const history = pushAll(['S0']);
    const undone = undo(history, 'S1')!;
    const cleared = clearHistory(undone.history);

    expect(canUndo(cleared)).toBe(false);
    expect(canRedo(cleared)).toBe(false);
  });
});

describe('undoHistory — bounded retention', () => {
  it('drops the oldest entries beyond the depth limit', () => {
    const depth = 5;
    let history = createHistory<string>(depth);
    for (let i = 0; i < depth + 5; i++) {
      history = push(history, `S${i}`);
    }

    expect(history.past).toHaveLength(depth);
    // The five earliest entries are gone; the oldest reachable is S5.
    expect(history.past[0]!.before).toBe('S5');
  });

  it('stops changing state once the retained history is exhausted', () => {
    const depth = 3;
    let history = createHistory<string>(depth);
    for (let i = 0; i < 6; i++) history = push(history, `S${i}`);

    let current = 'S6';
    let steps = 0;
    for (;;) {
      const result = undo(history, current);
      if (!result) break;
      history = result.history;
      current = result.state;
      steps++;
    }

    expect(steps).toBe(depth);
    expect(current).toBe('S3');
  });
});

describe('undoHistory — coalescing', () => {
  it('merges consecutive pushes sharing a key inside the window', () => {
    let history = createHistory<number>();
    history = push(history, 0, { coalesceKey: 'plan:declination', now: 1000 });
    history = push(history, 1, { coalesceKey: 'plan:declination', now: 1100 });
    history = push(history, 2, { coalesceKey: 'plan:declination', now: 1200 });

    expect(history.past).toHaveLength(1);
    // One undo reverses the whole drag, back to the value before it started.
    expect(undo(history, 3)?.state).toBe(0);
  });

  it('keeps a later interaction with the same control distinct', () => {
    let history = createHistory<number>();
    history = push(history, 0, { coalesceKey: 'plan:declination', now: 1000 });
    history = push(history, 1, { coalesceKey: 'plan:declination', now: 1100 });
    // Pause longer than the window, then drag again.
    history = push(history, 5, { coalesceKey: 'plan:declination', now: 1100 + COALESCE_WINDOW_MS + 1 });

    expect(history.past).toHaveLength(2);

    const first = undo(history, 9)!;
    expect(first.state).toBe(5);
    expect(undo(first.history, first.state)?.state).toBe(0);
  });

  it('does not merge pushes with different keys', () => {
    let history = createHistory<number>();
    history = push(history, 0, { coalesceKey: 'plan:declination', now: 1000 });
    history = push(history, 1, { coalesceKey: 'plan:bankAngle', now: 1050 });

    expect(history.past).toHaveLength(2);
  });

  it('does not merge pushes without a key, even in quick succession', () => {
    let history = createHistory<number>();
    history = push(history, 0, { now: 1000 });
    history = push(history, 1, { now: 1010 });

    expect(history.past).toHaveLength(2);
  });

  it('a coalesced push still discards redo history', () => {
    let history = createHistory<number>();
    history = push(history, 0, { coalesceKey: 'plan:declination', now: 1000 });
    const undone = undo(history, 1)!;
    expect(canRedo(undone.history)).toBe(true);

    const next = push(undone.history, 0, { coalesceKey: 'plan:declination', now: 1100 });
    expect(canRedo(next)).toBe(false);
  });
});
