import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouteCard } from './FlightPlanZone';
import type { FlightPlan, LegData, FlightPlanTurnPoint, Regime, Aircraft } from '../../types/flightPlan';
import { defaultAircraft } from '../../types/flightPlan';

// Provide a performance context with controllable regimes
let mockPerformance: Aircraft;

vi.mock('../../contexts/PerformanceContext', () => ({
  usePerformance: () => ({
    performance: mockPerformance,
  }),
}));

vi.mock('../../utils/flightPlanUtils', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../utils/flightPlanUtils')>();
  return {
    ...orig,
    flightPlanUtils: {
      ...orig.flightPlanUtils,
      insertTurnPointAtMidpoint: (plan: FlightPlan) => plan,
      updateTurnPoint: (plan: FlightPlan) => plan,
    },
  };
});

const makeWpt = (overrides: Partial<FlightPlanTurnPoint> = {}): FlightPlanTurnPoint => ({
  lat: 40,
  lon: 20,
  tas: 400,
  alt: 10000,
  fuelFlow: 3600,
  windSpeed: 0,
  windDir: 0,
  ...overrides,
});

const makeRegime = (overrides: Partial<Regime> = {}): Regime => ({
  id: 'r1',
  name: 'Alpha',
  cruise: { tas: 400, ff: 3600 },
  ...overrides,
});

const makeLegData = (overrides: Partial<LegData> = {}): LegData => ({
  course: 90,
  distance: 50,
  legFuel: 300,
  heading: 92,
  ete: 450,
  eta: 43200,
  efr: 9000,
  ...overrides,
});

const makePlan = (overrides: Partial<FlightPlan> = {}): FlightPlan => ({
  theatre: 'syria',
  points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000 })],
  declination: 0,
  bankAngle: 45,
  initTimeSec: 43200,
  initFob: 12000,
  name: 'Test',
  ...overrides,
});

describe('RouteCard', () => {
  const onUpdate = vi.fn();

  beforeEach(() => {
    onUpdate.mockClear();
    mockPerformance = defaultAircraft(); // no regimes by default
  });

  describe('Regime picker visibility', () => {
    it('hides regime picker when plan has no regimes', () => {
      mockPerformance = { ...defaultAircraft(), regimes: [] };
      const plan = makePlan();
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.queryByTitle('Select performance regime')).toBeNull();
    });

    it('shows regime picker button when plan has regimes', () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan();
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.getByTitle('Manual')).toBeInTheDocument();
    });

    it('shows "—" when no regime is bound', () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan();
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      const btn = screen.getByTitle('Manual');
      expect(btn).toHaveTextContent('—');
    });

    it('shows regime name when regime is bound', () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000, regimeId: 'r1' })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      const btn = screen.getByTitle('Alpha');
      expect(btn).toHaveTextContent('Alpha');
    });

    it('clicking picker button opens dropdown with regime names + Manual', async () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan();
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      await userEvent.click(screen.getByTitle('Manual'));
      expect(screen.getByText('Alpha')).toBeInTheDocument();
      expect(screen.getByText('— Manual —')).toBeInTheDocument();
    });

    it('selecting a regime calls applyRegimeToWaypoint and updates plan', async () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan();
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      await userEvent.click(screen.getByTitle('Manual'));
      await userEvent.click(screen.getByText('Alpha'));

      expect(onUpdate).toHaveBeenCalledOnce();
      const updated: FlightPlan = onUpdate.mock.calls[0][0];
      expect(updated.points[1].regimeId).toBe('r1');
    });

    it('selecting Manual calls clearRegimeBinding', async () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000, regimeId: 'r1' })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      await userEvent.click(screen.getByTitle('Alpha'));
      await userEvent.click(screen.getByText('— Manual —'));

      const updated: FlightPlan = onUpdate.mock.calls[0][0];
      expect(updated.points[1].regimeId).toBeUndefined();
    });
  });

  describe('Direct edit clears regime binding', () => {
    it('editing TAS with a changed value clears regimeId', async () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000, tas: 400, regimeId: 'r1' })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);

      const tasInput = screen.getByDisplayValue('400K');
      fireEvent.focus(tasInput);
      fireEvent.change(tasInput, { target: { value: '350' } });
      fireEvent.blur(tasInput);

      expect(onUpdate).toHaveBeenCalled();
      const updated: FlightPlan = onUpdate.mock.calls[0][0];
      expect(updated.points[1].regimeId).toBeUndefined();
      expect(updated.points[1].tas).toBe(350);
    });

    it('editing FF with a changed value clears regimeId', async () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000, fuelFlow: 3600, regimeId: 'r1' })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);

      const ffInput = screen.getByDisplayValue('3600pph');
      fireEvent.focus(ffInput);
      fireEvent.change(ffInput, { target: { value: '4000' } });
      fireEvent.blur(ffInput);

      expect(onUpdate).toHaveBeenCalled();
      const updated: FlightPlan = onUpdate.mock.calls[0][0];
      expect(updated.points[1].regimeId).toBeUndefined();
      expect(updated.points[1].fuelFlow).toBe(4000);
    });
  });

  describe('Alt and wind preserve regime binding', () => {
    it('editing alt does NOT clear regimeId', async () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000, regimeId: 'r1' })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);

      const altInput = screen.getByDisplayValue("10000'");
      fireEvent.focus(altInput);
      fireEvent.change(altInput, { target: { value: '15000' } });
      fireEvent.blur(altInput);

      expect(onUpdate).toHaveBeenCalled();
    });

    it('editing windDir does NOT clear regimeId', async () => {
      mockPerformance = { ...defaultAircraft(), regimes: [makeRegime()] };
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000, windDir: 270, regimeId: 'r1' })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);

      const windDirInput = screen.getByDisplayValue('270°');
      fireEvent.focus(windDirInput);
      fireEvent.change(windDirInput, { target: { value: '180' } });
      fireEvent.blur(windDirInput);

      expect(onUpdate).toHaveBeenCalled();
    });
  });

  describe('Altitude glyph rendering', () => {
    it('shows ↗ glyph when dest alt > prev alt', () => {
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000 })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData({ segmentsResult: { kind: 'level', tas: 400, ff: 3600 } })} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.getByText('↗')).toBeInTheDocument();
    });

    it('shows ↘ glyph when dest alt < prev alt', () => {
      const plan = makePlan({
        points: [makeWpt({ alt: 10000 }), makeWpt({ alt: 0 })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData({ segmentsResult: { kind: 'level', tas: 400, ff: 3600 } })} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.getByText('↘')).toBeInTheDocument();
    });

    it('shows no glyph when level', () => {
      const plan = makePlan({
        points: [makeWpt({ alt: 10000 }), makeWpt({ alt: 10000 })],
      });
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.queryByText('↗')).toBeNull();
      expect(screen.queryByText('↘')).toBeNull();
    });
  });

  describe('Segment tooltip with T/O row', () => {
    const toSeg = {
      kind: 'segmented' as const,
      takeoff: { time: 75 / 60, distance: 1.8, fuel: 250 },
      transition: { phase: 'climb' as const, time: 5, distance: 25, fuel: 333 },
      cruise: { time: 10, distance: 67, fuel: 600 },
    };
    const noToSeg = {
      kind: 'segmented' as const,
      transition: { phase: 'climb' as const, time: 5, distance: 25, fuel: 333 },
      cruise: { time: 10, distance: 67, fuel: 600 },
    };

    it('T/O row appears in tooltip on leg 1 when active', () => {
      const plan = makePlan({ points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000 })] });
      const legData = makeLegData({ segmentsResult: toSeg });
      render(<RouteCard flightPlan={plan} legData={legData} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.getByText('Take-off:')).toBeInTheDocument();
    });

    it('T/O row absent in tooltip on leg 1 when not active', () => {
      const plan = makePlan({ points: [makeWpt({ alt: 0 }), makeWpt({ alt: 10000 })] });
      const legData = makeLegData({ segmentsResult: noToSeg });
      render(<RouteCard flightPlan={plan} legData={legData} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.queryByText('Take-off:')).toBeNull();
    });
  });

  describe('Warning indicator', () => {
    const warningSeg = {
      kind: 'warning' as const,
      reason: 'transition-too-long' as const,
      transitionDistance: 75,
      reachableAltDelta: 20000,
      fallbackTimeSec: 450,
      fallbackFuel: 300,
    };

    it('shows ⚠ Fix button when leg has warning', () => {
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 30000 })],
      });
      const legData = makeLegData({ distance: 50, segmentsResult: warningSeg });
      render(<RouteCard flightPlan={plan} legData={legData} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.getByText('⚠ Fix')).toBeInTheDocument();
    });

    it('no ⚠ Fix button when leg is not a warning', () => {
      const plan = makePlan();
      render(<RouteCard flightPlan={plan} legData={makeLegData()} index={0} onFlightPlanUpdate={onUpdate} />);
      expect(screen.queryByText('⚠ Fix')).toBeNull();
    });

    it('⚠ Fix button does not trigger plan updates when clicked', async () => {
      const plan = makePlan({
        points: [makeWpt({ alt: 0 }), makeWpt({ alt: 30000 })],
      });
      const legData = makeLegData({ distance: 50, segmentsResult: warningSeg });
      render(<RouteCard flightPlan={plan} legData={legData} index={0} onFlightPlanUpdate={onUpdate} />);
      await userEvent.click(screen.getByText('⚠ Fix'));
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });
});
