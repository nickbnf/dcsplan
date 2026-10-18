/**
 * Plan-import library summary (add-library-profile-sync, task 6.3; spec:
 * map-objects, Library snapshot merge on plan import).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LibraryObject } from '../../types/flightPlan';
import { defaultAircraft } from '../../types/flightPlan';

let tier: 'anonymous' | 'signed-in' = 'anonymous';
vi.mock('../../contexts/PerformanceContext', () => ({
  usePerformance: () => ({ performance: defaultAircraft(), tier }),
}));

import { ImportFlightPlanDialog } from './ImportFlightPlanDialog';

const base = { type: 'sam_site' as const, lat: 42, lon: 41 };
const PLAN = {
  theatre: 'caucasus', points: [], declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0, name: 'Imported',
};

async function openWith(currentLibrary: LibraryObject[], snapshot: LibraryObject[]) {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flightPlan: PLAN }) });
  render(<ImportFlightPlanDialog onImport={vi.fn()} onLibrarySnapshot={vi.fn()} currentLibrary={currentLibrary} />);
  fireEvent.click(screen.getByText('Import'));
  const json = JSON.stringify({ version: '1.6', flightPlan: PLAN, librarySnapshot: snapshot });
  const file = new File([json], 'plan.json', { type: 'application/json' });
  (file as any).text = () => Promise.resolve(json);   // jsdom lacks Blob.text()
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByText('Library objects in file:')).toBeInTheDocument());
}

beforeEach(() => {
  vi.restoreAllMocks();
  tier = 'anonymous';
});

describe('ImportFlightPlanDialog — library summary', () => {
  it('reports kept entries that differ from the file', async () => {
    const lib = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, ...base }));
    const snapshot = [
      ...lib.slice(0, 3),
      { id: 'd', ...base, lat: 50 },
      { id: 'e', ...base, name: 'Renamed' },
    ];
    await openWith(lib, snapshot);
    expect(screen.getByText(/5 entries already present/)).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-differs')).toHaveTextContent(
      "2 of these differ from the file; the plan will show your library's version",
    );
  });

  it('shows no differs line when every kept entry matches', async () => {
    const lib = [{ id: 'a', ...base }];
    await openWith(lib, lib);
    expect(screen.queryByTestId('snapshot-differs')).toBeNull();
  });

  it('counts an entry absent from the library (e.g. deleted earlier) as added', async () => {
    await openWith([], [{ id: 'gone', ...base }]);
    expect(screen.getByText(/1 new entry will be added/)).toBeInTheDocument();
  });
});

describe('ImportFlightPlanDialog — the plan\'s profile (performance-profile, signed-in import)', () => {
  const PERF = { version: '1.0', aircraft: { ...defaultAircraft(), model: 'F-15E' } };

  async function importFile(extra: Record<string, unknown>, handler: (...a: any[]) => string | void) {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flightPlan: { ...PLAN, profileId: 'from-file' } }) });
    const onImport = vi.fn();
    render(<ImportFlightPlanDialog onImport={onImport} onPerformanceSnapshot={handler} />);
    fireEvent.click(screen.getByText('Import'));
    const json = JSON.stringify({ version: '1.6', flightPlan: PLAN, performanceSnapshot: PERF.aircraft, ...extra });
    const file = new File([json], 'plan.json', { type: 'application/json' });
    (file as any).text = () => Promise.resolve(json);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Imported')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /replace/i }));
    return onImport;
  }

  it('passes the file profile metadata and imports the plan flying the returned profile', async () => {
    tier = 'signed-in';
    const handler = vi.fn(() => 'space-profile-1');
    const onImport = await importFile({ performanceProfile: { id: 'p-9' } }, handler);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ model: 'F-15E' }), { id: 'p-9' });
    expect(onImport.mock.calls[0][0].profileId).toBe('space-profile-1');
  });

  it('drops a profileId carried by the file when the handler returns none (anonymous)', async () => {
    const onImport = await importFile({}, vi.fn());
    expect('profileId' in onImport.mock.calls[0][0]).toBe(false);
  });

  it('says the profile will be added when signed in', async () => {
    tier = 'signed-in';
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flightPlan: PLAN }) });
    render(<ImportFlightPlanDialog onImport={vi.fn()} onPerformanceSnapshot={vi.fn()} />);
    fireEvent.click(screen.getByText('Import'));
    const json = JSON.stringify({ version: '1.6', flightPlan: PLAN, performanceSnapshot: PERF.aircraft });
    const file = new File([json], 'plan.json');
    (file as any).text = () => Promise.resolve(json);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/will be added to your profiles/)).toBeInTheDocument());
  });
});
