import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { useUndoShortcuts } from './useUndoShortcuts';

const undo = vi.fn();
const redo = vi.fn();

const Harness: React.FC<{ enabled?: boolean }> = ({ enabled = true }) => {
  useUndoShortcuts({ undo, redo, enabled });
  return (
    <div>
      <textarea data-testid="comment" defaultValue="" />
      <input data-testid="numeric" type="number" />
      <div data-testid="rich" contentEditable suppressContentEditableWarning />
      <span data-testid="plain">not editable</span>
    </div>
  );
};

beforeEach(() => {
  undo.mockClear();
  redo.mockClear();
});

describe('useUndoShortcuts — bindings', () => {
  it('Ctrl+Z triggers undo', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).not.toHaveBeenCalled();
  });

  it('Cmd+Z triggers undo', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Shift+Z triggers redo', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
    expect(undo).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+Z triggers redo', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Y triggers redo', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('accepts uppercase Z, as sent when shift is held', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('ignores Z without a modifier', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'z' });
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignores unrelated modified keys', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });
});

describe('useUndoShortcuts — yields to editable fields', () => {
  it('ignores the shortcut while a textarea has focus', () => {
    render(<Harness />);
    const textarea = screen.getByTestId('comment');
    fireEvent.keyDown(textarea, { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignores the shortcut while a numeric input has focus', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId('numeric'), { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignores the shortcut inside a contenteditable region', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId('rich'), { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('applies the shortcut when the target is not editable', () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId('plain'), { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

describe('useUndoShortcuts — yields to coord entry', () => {
  it('ignores undo while disabled', () => {
    render(<Harness enabled={false} />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('ignores redo while disabled', () => {
    render(<Harness enabled={false} />);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(redo).not.toHaveBeenCalled();
  });

  it('resumes once re-enabled without re-registering', () => {
    const { rerender } = render(<Harness enabled={false} />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();

    rerender(<Harness enabled />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });
});

describe('useUndoShortcuts — cleanup', () => {
  it('stops listening after unmount', () => {
    const { unmount } = render(<Harness />);
    unmount();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).not.toHaveBeenCalled();
  });

  it('registers only one listener per mount', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
