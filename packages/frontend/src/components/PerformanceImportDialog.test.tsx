import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PerformanceImportDialog from './PerformanceImportDialog';
import type { FlightPlan } from '../types/flightPlan';
import { defaultAircraft } from '../types/flightPlan';

const makePlan = (overrides: Partial<FlightPlan> = {}): FlightPlan => ({
  theatre: 'syria',
  points: [],
  aircraft: defaultAircraft(),
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
  const onUpdate = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    onUpdate.mockClear();
    onClose.mockClear();
  });

  it('renders file picker initially', () => {
    render(<PerformanceImportDialog flightPlan={makePlan()} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    expect(screen.getByText(/Select a .json file/)).toBeInTheDocument();
    expect(screen.getByText('Replace')).toBeDisabled();
  });

  it('cancel calls onClose without updating plan', async () => {
    render(<PerformanceImportDialog flightPlan={makePlan()} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    await userEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('shows validation errors and keeps Replace disabled on invalid file', async () => {
    render(<PerformanceImportDialog flightPlan={makePlan()} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    await uploadFile(makeJsonFile({ version: '99.0', aircraft: {} }));

    await waitFor(() => {
      expect(screen.getByText(/Unsupported file version/)).toBeInTheDocument();
    });
    expect(screen.getByText('Replace')).toBeDisabled();
  });

  it('shows preview on valid file: filename, aircraft, T/O config, regime count', async () => {
    render(<PerformanceImportDialog flightPlan={makePlan()} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage, 'my-aircraft.perf.json'));

    await waitFor(() => {
      expect(screen.getByText('my-aircraft.perf.json')).toBeInTheDocument();
    });
    expect(screen.getByText('F-15E')).toBeInTheDocument();
    expect(screen.getByText('MIL')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Replace')).not.toBeDisabled();
  });

  it('replace overwrites aircraft and preserves other plan fields', async () => {
    const plan = makePlan({ name: 'My Plan', declination: 5 });
    render(<PerformanceImportDialog flightPlan={plan} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => expect(screen.getByText('Replace')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Replace'));

    expect(onUpdate).toHaveBeenCalledOnce();
    const updated: FlightPlan = onUpdate.mock.calls[0][0];
    expect(updated.aircraft.model).toBe('F-15E');
    expect(updated.name).toBe('My Plan');
    expect(updated.declination).toBe(5);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('orphan regimeId is cleared after replace', async () => {
    const plan = makePlan({
      points: [
        { lat: 0, lon: 0, alt: 0, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'old-regime' },
        { lat: 1, lon: 1, alt: 10000, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'r1' },
      ],
      aircraft: {
        ...defaultAircraft(),
        regimes: [{ id: 'old-regime', name: 'Old', cruise: { tas: 300, ff: 3000 } }],
      },
    });
    render(<PerformanceImportDialog flightPlan={plan} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => expect(screen.getByText('Replace')).not.toBeDisabled());
    await userEvent.click(screen.getByText('Replace'));

    const updated: FlightPlan = onUpdate.mock.calls[0][0];
    // old-regime not in imported set → cleared
    expect(updated.points[0].regimeId).toBeUndefined();
    // r1 IS in imported set → preserved
    expect(updated.points[1].regimeId).toBe('r1');
  });

  it('shows waypoint impact warning when plan has regime-bound waypoints', async () => {
    const plan = makePlan({
      points: [
        { lat: 0, lon: 0, alt: 0, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'r1' },
        { lat: 1, lon: 1, alt: 10000, tas: 400, fuelFlow: 3600, windSpeed: 0, windDir: 0, regimeId: 'r1' },
      ],
    });
    render(<PerformanceImportDialog flightPlan={plan} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => {
      expect(screen.getByText(/2 waypoints currently use a regime/)).toBeInTheDocument();
    });
  });

  it('does not show waypoint impact warning when no waypoints have regimes', async () => {
    const plan = makePlan({ points: [] });
    render(<PerformanceImportDialog flightPlan={plan} onFlightPlanUpdate={onUpdate} onClose={onClose} />);
    await uploadFile(makeJsonFile(validPackage));

    await waitFor(() => screen.getByText('F-15E'));
    expect(screen.queryByText(/waypoints currently use/)).toBeNull();
  });
});
