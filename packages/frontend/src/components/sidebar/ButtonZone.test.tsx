import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ButtonZone } from './ButtonZone';
import type { FlightPlan } from '../../types/flightPlan';

const plan: FlightPlan = {
  theatre: 'syria',
  points: [],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test Plan',
};

function renderZone(overrides: Partial<React.ComponentProps<typeof ButtonZone>> = {}) {
  const props: React.ComponentProps<typeof ButtonZone> = {
    flightPlan: plan,
    onFlightPlanUpdate: vi.fn(),
    onFlightPlanReplace: vi.fn(),
    isSettingsOpen: false,
    onSettingsToggle: vi.fn(),
    importTrigger: <button>Import</button>,
    onExport: vi.fn(),
    ...overrides,
  };
  render(<ButtonZone {...props} />);
  return {
    undo: screen.getByRole('button', { name: /undo/i }),
    redo: screen.getByRole('button', { name: /redo/i }),
  };
}

describe('ButtonZone undo/redo controls', () => {
  it('shows both controls as unavailable when nothing is recorded', () => {
    const { undo, redo } = renderZone({ canUndo: false, canRedo: false });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
  });

  it('enables undo once an edit is available to reverse', () => {
    const { undo, redo } = renderZone({ canUndo: true, canRedo: false });
    expect(undo).toBeEnabled();
    expect(redo).toBeDisabled();
  });

  it('enables redo once an edit has been reversed', () => {
    const { redo } = renderZone({ canUndo: false, canRedo: true });
    expect(redo).toBeEnabled();
  });

  it('invokes the undo handler when clicked', () => {
    const onUndo = vi.fn();
    const { undo } = renderZone({ canUndo: true, onUndo });
    fireEvent.click(undo);
    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it('invokes the redo handler when clicked', () => {
    const onRedo = vi.fn();
    const { redo } = renderZone({ canRedo: true, onRedo });
    fireEvent.click(redo);
    expect(onRedo).toHaveBeenCalledTimes(1);
  });

  it('does not invoke the handler while disabled', () => {
    const onUndo = vi.fn();
    const { undo } = renderZone({ canUndo: false, onUndo });
    fireEvent.click(undo);
    expect(onUndo).not.toHaveBeenCalled();
  });
});
