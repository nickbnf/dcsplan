/**
 * Kneeboard generation stamps the plan's version (add-version-history task 6.2;
 * design D8; spec: version-history — kneeboards are stamped with the plan's
 * version).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { FlightPlan } from '../../types/flightPlan';
import type { PlanVersion } from '../../api/planApi';

const flightPlanContext: { finalizeVersion?: () => Promise<PlanVersion | null> } = {};

vi.mock('../../contexts/PerformanceContext', () => ({
  usePerformance: () => ({
    performance: {
      model: 'F-15E', takeoffConfiguration: '', taxiFuel: 0,
      takeoff: { timeSec: 0, fuel: 0, distance: 0 }, regimes: [],
    },
  }),
}));
vi.mock('../../contexts/FlightPlanContext', () => ({
  useOptionalFlightPlan: () => flightPlanContext,
}));
vi.mock('../../utils/plausible', () => ({ trackEvent: vi.fn() }));

import { GenerateDialog } from './GenerateDialog';

const point = { lat: 42, lon: 41, tas: 400, alt: 3000, fuelFlow: 6000, windSpeed: 0, windDir: 0 };
const plan: FlightPlan = {
  theatre: 'caucasus', declination: 0, bankAngle: 45, initTimeSec: 43200, initFob: 12000,
  name: 'Strike', points: [{ ...point, id: 'w1' }, { ...point, id: 'w2', lat: 43 }],
};
const version: PlanVersion = {
  rev: 5, finalizedAt: '2026-07-23T14:32:00+00:00', restoredFrom: null,
  editors: [{ id: 'u1', displayName: 'Falcon' }],
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ task_id: 't1' }) });
  vi.stubGlobal('fetch', fetchMock);
  delete flightPlanContext.finalizeVersion;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function generate() {
  render(<GenerateDialog flightPlan={plan} library={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  fireEvent.click(screen.getByRole('button', { name: 'Generate ZIP' }));
}

const kneeboardPosts = () => fetchMock.mock.calls.filter(([url]) => String(url).includes('kneeboard?'));

describe('GenerateDialog version stamp', () => {
  it('finalizes a version before posting, and sends it as the revision', async () => {
    const order: string[] = [];
    flightPlanContext.finalizeVersion = vi.fn(async () => { order.push('finalize'); return version; });
    fetchMock.mockImplementation(async () => {
      order.push('kneeboard');
      return { ok: true, json: async () => ({ task_id: 't1' }) };
    });
    generate();
    await waitFor(() => expect(kneeboardPosts()).toHaveLength(1));
    expect(order.slice(0, 2)).toEqual(['finalize', 'kneeboard']);
    const body = JSON.parse(kneeboardPosts()[0][1].body);
    expect(body.revision).toEqual({ rev: 5, finalizedAt: '2026-07-23T14:32:00+00:00', editor: 'Falcon' });
  });

  it('shows an error and posts nothing when the version cannot be saved', async () => {
    flightPlanContext.finalizeVersion = vi.fn().mockRejectedValue(new Error('Failed to save a version (503)'));
    generate();
    expect(await screen.findByText(/Could not save a version of the plan/)).toBeTruthy();
    expect(kneeboardPosts()).toHaveLength(0);
  });

  it('makes no finalize call for an anonymous plan and sends no revision', async () => {
    generate();
    await waitFor(() => expect(kneeboardPosts()).toHaveLength(1));
    const body = JSON.parse(kneeboardPosts()[0][1].body);
    expect(body.revision).toBeUndefined();
  });
});
