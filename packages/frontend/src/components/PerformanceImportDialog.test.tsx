import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PerformanceImportDialog from './PerformanceImportDialog';
import type { FlightPlan, Aircraft } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

// Mock context hooks used by the dialog
const mockOnFlightPlanUpdate = vi.fn();
const mockSetPerformance = vi.fn();
let mockFlightPlan: FlightPlan;
let mockPerformance: Aircraft;

vi.mock('../contexts/FlightPlanContext', () => ({
  useFlightPlan: () => ({
    flightPlan: mockFlightPlan,
    onFlightPlanUpdate: mockOnFlightPlanUpdate,
  }),
}));

vi.mock('../contexts/PerformanceContext', () => ({
  usePerformance: () => ({
    performance: mockPerformance,
    setPerformance: mockSetPerformance,
    updateAircraft: vi.fn(),
    addRegime: vi.fn(),
    deleteRegime: vi.fn(),
    clearAll: vi.fn(),
  }),
}));

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

const validPackage = {
  version: '1.0',
  aircraft: {
    model: 'F-15E',
    takeoffConfiguration: 'MIL',
    taxiFuel: 400,
    takeoff: { timeSec: 0, fuel: 0, distance: 0 },
    regimes: [
      { id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } },
      { id: 'r2', name: 'Bravo', cruise: { tas: 350, ff: 3200 } },
    ],
  },
};

// jsdom does not implement File.prototype.text() — patch each instance
function makeJsonFile(content: object, filename = 'test.perf.json'): File {
  const jsonStr = JSON.stringify(content);
  const file = new File([jsonStr], filename, { type: 'application/json' });
  (file as any).text = () => Promise.resolve(jsonStr);
  return file;
}

async function uploadFile(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

describe('PerformanceImportDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    mockOnFlightPlanUpdate.mockClear();
    mockSetPerformance.mockClear();
    onClose.mockClear();
    mockFlightPlan = makePlan();
    mockPerformance = defaultAircraft();
  });

  it('renders file picker initially', () => {
    render(<PerformanceImportDialog onClose={onClose} />);
    expect(screen.getByText(/Select a .json file/)).toBeInTheDocument();
    expect(screen.getByText('Replace')).toBeDisabled();
  });

  it('cancel calls onClose without updating plan', async () => {
    render(<PerformanceImportDialog onClose={onClose} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mockSetPerformance).not.toHaveBeenCalled();
  });

  it('shows validation errors and keeps Replace disabled on invalid file', async () => {
    render(<PerformanceImportDialog onClose={onClose} />);
    await uploadFile(makeJsonFile({ version: '99.0', aircraft: {} }));

    await waitFor(() => {
      expect(screen.getByText(/Unsupported file version/)).toBeInTheDocument();
    });
    expect(screen.getByText('Replace')).toBeDisabled();
  });

  it('shows preview on valid file: filename, aircraft, T/O config, regime count', async () => {
    render(<PerformanceImportDialog onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage, 'my-aircraft.perf.json'));

    await waitFor(() => {
      expect(screen.getByText('my-aircraft.perf.json')).toBeInTheDocument();
      expect(screen.getByText('F-15E')).toBeInTheDocument();
      expect(screen.getByText('MIL')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('Replace')).not.toBeDisabled();
    });
  });

  it('replace calls setPerformance with the validated aircraft', async () => {
    render(<PerformanceImportDialog onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => expect(screen.getByText('Replace')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Replace'));

    expect(mockSetPerformance).toHaveBeenCalledOnce();
    const updated: Aircraft = mockSetPerformance.mock.calls[0][0];
    expect(updated.model).toBe('F-15E');
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('orphan regimeId is cleared after replace', async () => {
    mockFlightPlan = makePlan({
      points: [
        { lat: 0, lon: 0, alt: 0, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'old-regime' },
        { lat: 1, lon: 1, alt: 10000, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'r1' },
      ],
    });
    render(<PerformanceImportDialog onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => expect(screen.getByText('Replace')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Replace'));

    // old-regime not in imported set → flight plan update to clear it
    expect(mockOnFlightPlanUpdate).toHaveBeenCalledOnce();
    const updated: FlightPlan = mockOnFlightPlanUpdate.mock.calls[0][0];
    expect(updated.points[0].regimeId).toBeUndefined();
    // r1 IS in imported set → preserved
    expect(updated.points[1].regimeId).toBe('r1');
  });

  it('does not call onFlightPlanUpdate when no orphan regimeIds', async () => {
    mockFlightPlan = makePlan({ points: [] });
    render(<PerformanceImportDialog onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => expect(screen.getByText('Replace')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Replace'));

    expect(mockOnFlightPlanUpdate).not.toHaveBeenCalled();
  });

  it('shows waypoint impact warning when plan has regime-bound waypoints', async () => {
    mockFlightPlan = makePlan({
      points: [
        { lat: 0, lon: 0, alt: 0, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'r1' },
        { lat: 1, lon: 1, alt: 10000, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'r1' },
      ],
    });
    render(<PerformanceImportDialog onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => {
      expect(screen.getByText(/2 waypoints currently use a regime/)).toBeInTheDocument();
    });
  });

  it('does not show waypoint impact warning when no waypoints have regimes', async () => {
    mockFlightPlan = makePlan({ points: [] });
    render(<PerformanceImportDialog onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => screen.getByText('F-15E'));
    expect(screen.queryByText(/waypoints currently use/)).toBeNull();
  });
});
