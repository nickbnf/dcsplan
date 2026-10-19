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

const theatres = [
  { id: 'caucasus', name: 'Caucasus' },
  { id: 'syria', name: 'Syria' },
];

function renderZone(overrides: Partial<React.ComponentProps<typeof ButtonZone>> = {}) {
  const props: React.ComponentProps<typeof ButtonZone> = {
    flightPlan: plan,
    theatres,
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

describe('ButtonZone action row', () => {
  it('hides the New button when showNewButton is false (signed-in)', () => {
    renderZone({ showNewButton: false });
    expect(screen.queryByRole('button', { name: /new/i })).not.toBeInTheDocument();
  });

  it('shows New flight plan button instead of Clear', () => {
    renderZone();
    expect(screen.getByRole('button', { name: /new/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });
});

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

describe('ButtonZone file actions by tier (plan-import)', () => {
  it('anonymous: Import and Export are primary buttons', () => {
    renderZone();
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('signed in: no import, and Export is reached through the More actions menu', () => {
    const onExport = vi.fn();
    renderZone({ fileActionsInMenu: true, onExport });
    expect(screen.queryByRole('button', { name: 'Import' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument();
    const more = screen.getByRole('button', { name: 'More actions' });
    fireEvent.keyDown(more, { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: /export to file/i }));
    expect(onExport).toHaveBeenCalled();
  });
});
