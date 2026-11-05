import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaypointCard } from './FlightPlanZone';
import type { FlightPlan, FlightPlanTurnPoint } from '../../types/flightPlan';
import { defaultAircraft } from '../../types/flightPlan';

vi.mock('../../contexts/PerformanceContext', () => ({
  usePerformance: () => ({ performance: defaultAircraft() }),
}));

vi.mock('../../contexts/WaypointSelectionContext', () => ({
  useWaypointSelection: () => ({ selectedIndex: null, setSelectedIndex: () => {}, coordEntry: null }),
}));

const makeWpt = (id: string, overrides: Partial<FlightPlanTurnPoint> = {}): FlightPlanTurnPoint => ({
  id, lat: 40, lon: 20, tas: 400, alt: 10000, fuelFlow: 3600, windSpeed: 0, windDir: 0, ...overrides,
});

const makePlan = (first: Partial<FlightPlanTurnPoint> = {}): FlightPlan => ({
  theatre: 'syria',
  points: [makeWpt('a', first), makeWpt('b'), makeWpt('c')],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test',
});

function commitRunway(input: HTMLElement, value: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

describe('WaypointCard — runway input (departure)', () => {
  const onUpdate = vi.fn();
  beforeEach(() => onUpdate.mockClear());

  it('shows the Rwy input on the first card only', () => {
    const plan = makePlan();
    const { unmount } = render(<WaypointCard flightPlan={plan} legData={null} index={0} onFlightPlanUpdate={onUpdate} />);
    expect(screen.getByText('Rwy')).toBeInTheDocument();
    unmount();
    render(<WaypointCard flightPlan={plan} legData={null} index={1} onFlightPlanUpdate={onUpdate} />);
    expect(screen.queryByText('Rwy')).toBeNull();
  });

  it('puts Field alt and Rwy on their own row, below HACK and T/O', () => {
    render(<WaypointCard flightPlan={makePlan()} legData={null} index={0} onFlightPlanUpdate={onUpdate} />);
    const rowOf = (text: string) => screen.getByText(text).closest('.mt-1');
    expect(rowOf('Field alt')).toBe(rowOf('Rwy'));
    expect(rowOf('HACK')).toBe(rowOf('T/O'));
    expect(rowOf('Rwy')).not.toBe(rowOf('HACK'));
    expect(rowOf('HACK')!.compareDocumentPosition(rowOf('Rwy')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps Field alt on the last waypoint, once, without Rwy', () => {
    render(<WaypointCard flightPlan={makePlan()} legData={null} index={2} onFlightPlanUpdate={onUpdate} />);
    expect(screen.getAllByText('Field alt')).toHaveLength(1);
    expect(screen.queryByText('Rwy')).toBeNull();
  });

  it('shows Field alt once on a single-waypoint plan', () => {
    const plan = { ...makePlan(), points: [makeWpt('a')] };
    render(<WaypointCard flightPlan={plan} legData={null} index={0} onFlightPlanUpdate={onUpdate} />);
    expect(screen.getAllByText('Field alt')).toHaveLength(1);
  });

  it('displays the runway as two digits', () => {
    render(<WaypointCard flightPlan={makePlan({ runway: 9 })} legData={null} index={0} onFlightPlanUpdate={onUpdate} />);
    expect(screen.getByDisplayValue('09')).toBeInTheDocument();
  });

  it('commits a valid runway', () => {
    render(<WaypointCard flightPlan={makePlan()} legData={null} index={0} onFlightPlanUpdate={onUpdate} />);
    commitRunway(screen.getByPlaceholderText('--'), '9');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].points[0].runway).toBe(9);
  });

  it('clears the runway on an empty commit', () => {
    render(<WaypointCard flightPlan={makePlan({ runway: 27 })} legData={null} index={0} onFlightPlanUpdate={onUpdate} />);
    commitRunway(screen.getByDisplayValue('27'), '');
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0].points[0].runway).toBeUndefined();
  });

  it.each(['0', '37', '27.5'])('rejects %s with an inline error', (value) => {
    render(<WaypointCard flightPlan={makePlan({ runway: 27 })} legData={null} index={0} onFlightPlanUpdate={onUpdate} />);
    commitRunway(screen.getByDisplayValue('27'), value);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Runway must be 01–36');
  });
});
