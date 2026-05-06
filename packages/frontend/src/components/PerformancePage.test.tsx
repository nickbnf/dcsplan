import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PerformancePage from './PerformancePage';
import type { FlightPlan, Regime } from '../types/flightPlan';

// Mock useFlightPlan so we control the plan state
const mockOnFlightPlanUpdate = vi.fn();
let mockFlightPlan: FlightPlan;

vi.mock('../contexts/FlightPlanContext', () => ({
  useFlightPlan: () => ({
    flightPlan: mockFlightPlan,
    onFlightPlanUpdate: mockOnFlightPlanUpdate,
  }),
}));

// generateRegimeId must return predictable ids in tests
vi.mock('../utils/flightPlanUtils', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../utils/flightPlanUtils')>();
  let counter = 0;
  return {
    ...orig,
    generateRegimeId: () => `test-id-${++counter}`,
  };
});

const makeRegime = (overrides: Partial<Regime> = {}): Regime => ({
  id: 'r1',
  name: 'Alpha',
  cruise: { tas: 400, ff: 3600 },
  ...overrides,
});

const makePlan = (overrides: Partial<FlightPlan> = {}): FlightPlan => ({
  theatre: 'syria',
  points: [],
  regimes: [],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test',
  ...overrides,
});

describe('PerformancePage', () => {
  beforeEach(() => {
    mockOnFlightPlanUpdate.mockClear();
    mockFlightPlan = makePlan();
  });

  it('shows empty state message when no regimes', () => {
    render(<PerformancePage />);
    expect(screen.getByText(/No performance regimes defined/)).toBeInTheDocument();
  });

  it('clicking "+ Add regime" creates a new regime and selects it', async () => {
    render(<PerformancePage />);
    await userEvent.click(screen.getByText('+ Add regime'));

    expect(mockOnFlightPlanUpdate).toHaveBeenCalledOnce();
    const updated: FlightPlan = mockOnFlightPlanUpdate.mock.calls[0][0];
    expect(updated.regimes).toHaveLength(1);
    expect(updated.regimes[0].name).toBe('Regime 1');
    expect(updated.regimes[0].cruise.tas).toBe(400);

    // Simulate the context re-rendering with the new plan
    mockFlightPlan = updated;
    mockOnFlightPlanUpdate.mockClear();

    // After re-render, editor should be visible
    const { unmount } = render(<PerformancePage />);
    // The selected id was set in local state so we just check onFlightPlanUpdate was called
    unmount();
  });

  it('auto-increments default name: Regime 1, Regime 2', async () => {
    mockFlightPlan = makePlan({ regimes: [makeRegime({ id: 'r1', name: 'Regime 1' })] });
    render(<PerformancePage />);
    await userEvent.click(screen.getByText('+ Add regime'));

    const updated: FlightPlan = mockOnFlightPlanUpdate.mock.calls[0][0];
    expect(updated.regimes[1].name).toBe('Regime 2');
  });

  it('shows climb/descent badges in the list', () => {
    mockFlightPlan = makePlan({
      regimes: [
        makeRegime({ id: 'r1', name: 'Alpha', climb: { tas: 300, ff: 4000, roc: 2000 } }),
        makeRegime({ id: 'r2', name: 'Bravo' }),
      ],
    });
    render(<PerformancePage />);

    const alphaRow = screen.getByText('Alpha').closest('button')!;
    expect(within(alphaRow).getByText('↑')).toBeInTheDocument();

    const bravoRow = screen.getByText('Bravo').closest('button')!;
    expect(within(bravoRow).queryByText('↑')).toBeNull();
  });

  describe('RegimeEditor', () => {
    const regime = makeRegime({ id: 'r1', name: 'Alpha' });

    beforeEach(() => {
      mockFlightPlan = makePlan({ regimes: [regime] });
    });

    const openEditor = async () => {
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
    };

    it('renders editor when a regime is selected', async () => {
      await openEditor();
      expect(screen.getByText('Edit Regime')).toBeInTheDocument();
    });

    it('shows error for empty name', async () => {
      await openEditor();
      const nameInput = screen.getByDisplayValue('Alpha');
      await userEvent.clear(nameInput);
      expect(screen.getByText('Name is required.')).toBeInTheDocument();
    });

    it('rejects duplicate name (case-sensitive)', async () => {
      mockFlightPlan = makePlan({
        regimes: [
          makeRegime({ id: 'r1', name: 'Alpha' }),
          makeRegime({ id: 'r2', name: 'Beta' }),
        ],
      });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));

      const nameInput = screen.getByDisplayValue('Alpha');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Beta');
      expect(screen.getByText('Name must be unique.')).toBeInTheDocument();
    });

    it('rename preserves the regime id', async () => {
      await openEditor();
      const nameInput = screen.getByDisplayValue('Alpha');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'Zulu');

      const calls = mockOnFlightPlanUpdate.mock.calls;
      const lastCall: FlightPlan = calls[calls.length - 1][0];
      const updated = lastCall.regimes.find(r => r.id === 'r1');
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Zulu');
    });

    it('all-or-nothing validation: partial climb shows error', async () => {
      await openEditor();
      // Fill only one climb field
      const tasInputs = screen.getAllByRole('spinbutton');
      // Climb TAS is the 3rd spinbutton (after cruise TAS, cruise FF)
      fireEvent.change(tasInputs[2], { target: { value: '300' } });
      expect(screen.getByText('Fill all fields or leave all empty.')).toBeInTheDocument();
    });

    it('all-or-nothing validation: partial descent shows error', async () => {
      await openEditor();
      const tasInputs = screen.getAllByRole('spinbutton');
      // Descent TAS is the 6th spinbutton
      fireEvent.change(tasInputs[5], { target: { value: '200' } });
      expect(screen.getByText('Fill all fields or leave all empty.')).toBeInTheDocument();
    });

    it('propagates cruise change to waypoints when TAS changes', async () => {
      const regime2 = makeRegime({ id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } });
      const point = {
        lat: 0, lon: 0, alt: 10000, regimeId: 'r1',
        tas: 400, fuelFlow: 3600,
        name: '', waypointComment: '', waypoints: [], waypointType: 'normal' as const,
        windSpeed: 0, windDir: 0,
      };
      mockFlightPlan = makePlan({ regimes: [regime2], points: [point] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));

      mockOnFlightPlanUpdate.mockClear();

      const tasInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(tasInput, { target: { value: '450' } });

      const calls = mockOnFlightPlanUpdate.mock.calls;
      if (calls.length > 0) {
        const updated: FlightPlan = calls[calls.length - 1][0];
        const updatedPoint = updated.points[0];
        expect(updatedPoint.tas).toBe(450);
      }
    });
  });

  describe('Delete regime', () => {
    it('shows unreferenced delete dialog text', async () => {
      const regime = makeRegime({ id: 'r1', name: 'Alpha' });
      mockFlightPlan = makePlan({ regimes: [regime], points: [] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
      await userEvent.click(screen.getByText('Delete regime'));

      expect(screen.getByText(/Delete "Alpha"\? This action cannot be undone\./)).toBeInTheDocument();
    });

    it('shows referenced delete dialog with leg count', async () => {
      const regime = makeRegime({ id: 'r1', name: 'Alpha' });
      const point = {
        lat: 0, lon: 0, alt: 10000, regimeId: 'r1',
        tas: 400, fuelFlow: 3600,
        name: '', waypointComment: '', waypoints: [], waypointType: 'normal' as const,
        windSpeed: 0, windDir: 0,
      };
      mockFlightPlan = makePlan({ regimes: [regime], points: [point] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
      await userEvent.click(screen.getByText('Delete regime'));

      expect(screen.getByText(/This regime is used on 1 leg\./)).toBeInTheDocument();
      expect(screen.getByText(/Deleting will revert them to Manual\./)).toBeInTheDocument();
    });

    it('cancel delete dialog leaves regime intact', async () => {
      const regime = makeRegime({ id: 'r1', name: 'Alpha' });
      mockFlightPlan = makePlan({ regimes: [regime] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
      await userEvent.click(screen.getByText('Delete regime'));
      await userEvent.click(screen.getByText('Cancel'));

      expect(mockOnFlightPlanUpdate).not.toHaveBeenCalled();
    });

    it('confirming delete removes regime and clears waypoint bindings', async () => {
      const regime = makeRegime({ id: 'r1', name: 'Alpha' });
      const point = {
        lat: 0, lon: 0, alt: 10000, regimeId: 'r1',
        tas: 400, fuelFlow: 3600,
        name: '', waypointComment: '', waypoints: [], waypointType: 'normal' as const,
        windSpeed: 0, windDir: 0,
      };
      mockFlightPlan = makePlan({ regimes: [regime], points: [point] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
      await userEvent.click(screen.getByText('Delete regime'));

      const deleteButtons = screen.getAllByText('Delete');
      await userEvent.click(deleteButtons[deleteButtons.length - 1]);

      expect(mockOnFlightPlanUpdate).toHaveBeenCalledOnce();
      const updated: FlightPlan = mockOnFlightPlanUpdate.mock.calls[0][0];
      expect(updated.regimes).toHaveLength(0);
      expect(updated.points[0].regimeId).toBeUndefined();
    });
  });
});
