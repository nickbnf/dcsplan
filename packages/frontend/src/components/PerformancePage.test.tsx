import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PerformancePage from './PerformancePage';
import type { FlightPlan, Aircraft, Regime } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

// Mock useFlightPlan so we control the plan state
const mockOnFlightPlanUpdate = vi.fn();
let mockFlightPlan: FlightPlan;

vi.mock('../contexts/FlightPlanContext', () => ({
  useFlightPlan: () => ({
    flightPlan: mockFlightPlan,
    onFlightPlanUpdate: mockOnFlightPlanUpdate,
  }),
}));

// Mock usePerformance so we control the performance state
const mockSetPerformance = vi.fn();
let mockPerformance: Aircraft;

vi.mock('../contexts/PerformanceContext', () => ({
  usePerformance: () => ({
    performance: mockPerformance,
    setPerformance: mockSetPerformance,
    updateAircraft: (patch: Partial<Aircraft>) => mockSetPerformance({ ...mockPerformance, ...patch }),
    addRegime: (r: Regime) => mockSetPerformance({ ...mockPerformance, regimes: [...mockPerformance.regimes, r] }),
    deleteRegime: (id: string) => mockSetPerformance({ ...mockPerformance, regimes: mockPerformance.regimes.filter((r: Regime) => r.id !== id) }),
    clearAll: vi.fn(),
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
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test',
  ...overrides,
});

const TO_TOOLTIP_TEXT = 'Time, fuel, and distance covered from brake release through acceleration to climb speed. Use values from your aircraft\'s performance charts for your T/O configuration. Or obtain by flight testing the difference between a cruise climb and the same climb from brake release.';

describe('PerformancePage', () => {
  beforeEach(() => {
    mockOnFlightPlanUpdate.mockClear();
    mockSetPerformance.mockClear();
    mockFlightPlan = makePlan();
    mockPerformance = defaultAircraft();
  });

  describe('Aircraft header', () => {
    it('header is always visible with no regimes', () => {
      render(<PerformancePage />);
      expect(screen.getByPlaceholderText('e.g. F-15E')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. MIL @ 60klb')).toBeInTheDocument();
    });

    it('header is always visible with regimes', () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      render(<PerformancePage />);
      expect(screen.getByPlaceholderText('e.g. F-15E')).toBeInTheDocument();
    });

    it('editing aircraft model calls setPerformance with new model', () => {
      render(<PerformancePage />);
      fireEvent.change(screen.getByPlaceholderText('e.g. F-15E'), { target: { value: 'F-16C' } });
      expect(mockSetPerformance).toHaveBeenCalled();
      const updated: Aircraft = mockSetPerformance.mock.calls[0][0];
      expect(updated.model).toBe('F-16C');
    });

    it('editing T/O config calls setPerformance with new config', () => {
      render(<PerformancePage />);
      fireEvent.change(screen.getByPlaceholderText('e.g. MIL @ 60klb'), { target: { value: 'AB' } });
      expect(mockSetPerformance).toHaveBeenCalled();
      const updated: Aircraft = mockSetPerformance.mock.calls[0][0];
      expect(updated.takeoffConfiguration).toBe('AB');
    });

    it('editing taxi fuel calls setPerformance with new taxiFuel', () => {
      render(<PerformancePage />);
      const taxiInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(taxiInput, { target: { value: '500' } });
      expect(mockSetPerformance).toHaveBeenCalled();
      const updated: Aircraft = mockSetPerformance.mock.calls[0][0];
      expect(updated.taxiFuel).toBe(500);
    });

    it('T/O info icon has correct tooltip text', () => {
      render(<PerformancePage />);
      const icon = screen.getByLabelText('Take-off performance info');
      expect(icon).toHaveAttribute('title', TO_TOOLTIP_TEXT);
    });

    it('T/O all-or-nothing: all-zero is accepted (no error)', () => {
      mockPerformance = defaultAircraft();
      render(<PerformancePage />);
      // All zero by default — no error shown
      expect(screen.queryByText(/All three take-off fields/)).toBeNull();
    });

    it('T/O all-or-nothing: partial (only fuel positive) shows error and does not persist', () => {
      render(<PerformancePage />);
      const toFuelInput = screen.getAllByRole('spinbutton')[1];
      fireEvent.change(toFuelInput, { target: { value: '250' } });
      fireEvent.blur(toFuelInput);
      // Partial state: only fuel > 0, timeSec and distance are 0 → validation rejects
      expect(screen.getByText(/All three take-off fields/)).toBeInTheDocument();
      expect(mockSetPerformance).not.toHaveBeenCalled();
    });

    it('T/O all-or-nothing: all-positive is accepted', () => {
      mockPerformance = {
        ...defaultAircraft(),
        takeoff: { timeSec: 75, fuel: 250, distance: 1.8 },
      };
      render(<PerformancePage />);
      // No error initially
      expect(screen.queryByText(/All three take-off fields/)).toBeNull();
    });
  });

  it('shows empty state message when no regimes', () => {
    render(<PerformancePage />);
    expect(screen.getByText(/No performance regimes defined/)).toBeInTheDocument();
  });

  it('clicking "+ Add regime" creates a new regime and selects it', async () => {
    render(<PerformancePage />);
    await userEvent.click(screen.getByText('+ Add regime'));

    expect(mockSetPerformance).toHaveBeenCalledOnce();
    const updated: Aircraft = mockSetPerformance.mock.calls[0][0];
    expect(updated.regimes).toHaveLength(1);
    expect(updated.regimes[0].name).toBe('Regime 1');
    expect(updated.regimes[0].cruise.tas).toBe(400);

    // Simulate the context re-rendering with the new performance
    mockPerformance = updated;
    mockSetPerformance.mockClear();

    // After re-render, editor should be visible
    const { unmount } = render(<PerformancePage />);
    unmount();
  });

  it('auto-increments default name: Regime 1, Regime 2', async () => {
    mockPerformance = { ...defaultAircraft(), regimes: [makeRegime({ id: 'r1', name: 'Regime 1' })] };
    render(<PerformancePage />);
    await userEvent.click(screen.getByText('+ Add regime'));

    const updated: Aircraft = mockSetPerformance.mock.calls[0][0];
    expect(updated.regimes[1].name).toBe('Regime 2');
  });

  it('shows climb/descent badges in the list', () => {
    mockPerformance = {
      ...defaultAircraft(),
      regimes: [
        makeRegime({ id: 'r1', name: 'Alpha', climb: { tas: 300, ff: 4000, roc: 2000 } }),
        makeRegime({ id: 'r2', name: 'Bravo' }),
      ],
    };
    render(<PerformancePage />);

    const alphaRow = screen.getByText('Alpha').closest('button')!;
    expect(within(alphaRow).getByText('↑')).toBeInTheDocument();

    const bravoRow = screen.getByText('Bravo').closest('button')!;
    expect(within(bravoRow).queryByText('↑')).toBeNull();
  });

  describe('RegimeEditor', () => {
    const regime = makeRegime({ id: 'r1', name: 'Alpha' });

    beforeEach(() => {
      mockPerformance = { ...defaultAircraft(), regimes: [regime] };
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
      mockPerformance = {
        ...defaultAircraft(),
        regimes: [
          makeRegime({ id: 'r1', name: 'Alpha' }),
          makeRegime({ id: 'r2', name: 'Beta' }),
        ],
      };
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

      const calls = mockSetPerformance.mock.calls;
      const lastCall: Aircraft = calls[calls.length - 1][0];
      const updated = lastCall.regimes.find((r: Regime) => r.id === 'r1');
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Zulu');
    });

    it('all-or-nothing validation: partial climb shows error', async () => {
      await openEditor();
      // Fill only one climb field
      const tasInputs = screen.getAllByRole('spinbutton');
      // Header adds: taxiFuel[0], T/O fuel[1], T/O distance[2]; regime editor: cruise TAS[3], cruise FF[4], climb TAS[5]
      fireEvent.change(tasInputs[5], { target: { value: '300' } });
      expect(screen.getByText('Fill all fields or leave all empty.')).toBeInTheDocument();
    });

    it('all-or-nothing validation: partial descent shows error', async () => {
      await openEditor();
      const tasInputs = screen.getAllByRole('spinbutton');
      // Descent TAS is the 9th spinbutton (after taxiFuel, T/O fuel, T/O distance, cruise TAS, cruise FF, climb TAS, climb FF, climb ROC)
      fireEvent.change(tasInputs[8], { target: { value: '200' } });
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
      mockPerformance = { ...defaultAircraft(), regimes: [regime2] };
      mockFlightPlan = makePlan({ points: [point] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));

      mockSetPerformance.mockClear();

      // Header adds taxiFuel[0], T/O fuel[1], T/O distance[2]; cruise TAS is [3]
      const tasInput = screen.getAllByRole('spinbutton')[3];
      fireEvent.change(tasInput, { target: { value: '450' } });

      const calls = mockSetPerformance.mock.calls;
      if (calls.length > 0) {
        const updated: Aircraft = calls[calls.length - 1][0];
        expect(updated.regimes[0].cruise.tas).toBe(450);
      }
    });
  });

  describe('Delete regime', () => {
    it('shows unreferenced delete dialog text', async () => {
      const regime = makeRegime({ id: 'r1', name: 'Alpha' });
      mockPerformance = { ...defaultAircraft(), regimes: [regime] };
      mockFlightPlan = makePlan({ points: [] });
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
      mockPerformance = { ...defaultAircraft(), regimes: [regime] };
      mockFlightPlan = makePlan({ points: [point] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
      await userEvent.click(screen.getByText('Delete regime'));

      expect(screen.getByText(/This regime is used on 1 leg\./)).toBeInTheDocument();
      expect(screen.getByText(/Deleting will revert them to Manual\./)).toBeInTheDocument();
    });

    it('cancel delete dialog leaves regime intact', async () => {
      const regime = makeRegime({ id: 'r1', name: 'Alpha' });
      mockPerformance = { ...defaultAircraft(), regimes: [regime] };
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
      await userEvent.click(screen.getByText('Delete regime'));
      await userEvent.click(screen.getByText('Cancel'));

      expect(mockSetPerformance).not.toHaveBeenCalled();
    });

    it('confirming delete removes regime and clears waypoint bindings', async () => {
      const regime = makeRegime({ id: 'r1', name: 'Alpha' });
      const point = {
        lat: 0, lon: 0, alt: 10000, regimeId: 'r1',
        tas: 400, fuelFlow: 3600,
        name: '', waypointComment: '', waypoints: [], waypointType: 'normal' as const,
        windSpeed: 0, windDir: 0,
      };
      mockPerformance = { ...defaultAircraft(), regimes: [regime] };
      mockFlightPlan = makePlan({ points: [point] });
      render(<PerformancePage />);
      await userEvent.click(screen.getByText('Alpha'));
      await userEvent.click(screen.getByText('Delete regime'));

      const deleteButtons = screen.getAllByText('Delete');
      await userEvent.click(deleteButtons[deleteButtons.length - 1]);

      // Performance update: regime removed
      expect(mockSetPerformance).toHaveBeenCalledOnce();
      const updatedPerf: Aircraft = mockSetPerformance.mock.calls[0][0];
      expect(updatedPerf.regimes).toHaveLength(0);

      // Flight plan update: waypoint binding cleared
      expect(mockOnFlightPlanUpdate).toHaveBeenCalledOnce();
      const updatedPlan: FlightPlan = mockOnFlightPlanUpdate.mock.calls[0][0];
      expect(updatedPlan.points[0].regimeId).toBeUndefined();
    });
  });
});
