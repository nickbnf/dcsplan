/**
 * Plan-file import dialog (add-local-data-import task 4.2; spec: plan-import;
 * map-objects, *Library snapshot merge on plan import*).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { LibraryObject } from '../../types/flightPlan';
import { defaultAircraft } from '../../types/flightPlan';
import { importAnonymously, type AnonymousTargets } from '../../import/anonymousDestination';
import type { HeldAssets } from '../../import/types';
import { ImportFlightPlanDialog } from './ImportFlightPlanDialog';

const base = { type: 'sam_site' as const, lat: 42, lon: 41 };
const PLAN = {
  theatre: 'caucasus', points: [], declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0, name: 'Imported',
};
const AIRCRAFT = { ...defaultAircraft(), model: 'F-15E' };

let targets: AnonymousTargets;

function renderAnonymous(currentLibrary: LibraryObject[] = []) {
  const held: HeldAssets = { entries: () => currentLibrary, hasProfile: () => false };
  render(
    <ImportFlightPlanDialog
      tier="anonymous"
      held={held}
      execute={(source, selection) => importAnonymously(source, selection, targets)}
    />,
  );
}

async function pickFile(content: object) {
  fireEvent.click(screen.getByText('Import'));
  const json = JSON.stringify(content);
  const file = new File([json], 'plan.json', { type: 'application/json' });
  (file as any).text = () => Promise.resolve(json);   // jsdom lacks Blob.text()
  fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
}

async function openWith(currentLibrary: LibraryObject[], snapshot: LibraryObject[]) {
  renderAnonymous(currentLibrary);
  await pickFile({ version: '1.6', flightPlan: PLAN, librarySnapshot: snapshot });
  await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
}

beforeEach(() => {
  vi.restoreAllMocks();
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flightPlan: PLAN }) });
  targets = { mergeEntries: vi.fn(), setProfile: vi.fn(), replacePlan: vi.fn() };
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
    expect(screen.getByText('5 objects, all already in your library')).toBeInTheDocument();
    expect(screen.getByTestId('snapshot-differs')).toHaveTextContent("2 of these differ; your library's version is kept");
  });

  it('shows no differs line when every kept entry matches', async () => {
    const lib = [{ id: 'a', ...base }];
    await openWith(lib, lib);
    expect(screen.queryByTestId('snapshot-differs')).toBeNull();
  });

  it('counts an entry absent from the library (e.g. deleted earlier) as new', async () => {
    await openWith([], [{ id: 'gone', ...base }]);
    expect(screen.getByText('1 new')).toBeInTheDocument();
  });
});

describe('ImportFlightPlanDialog — anonymous import', () => {
  it('warns that the plan is replaced, then replaces it', async () => {
    renderAnonymous();
    await pickFile({ version: '1.6', flightPlan: PLAN, performanceSnapshot: AIRCRAFT });
    await waitFor(() => expect(screen.getByText('Your current flight plan will be replaced.')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(targets.replacePlan).toHaveBeenCalledWith(expect.objectContaining({ name: 'Imported' }));
    expect(targets.setProfile).toHaveBeenCalledWith(AIRCRAFT);
  });

  it('keeps the current profile when the profile is unticked', async () => {
    renderAnonymous();
    await pickFile({ version: '1.6', flightPlan: PLAN, performanceSnapshot: AIRCRAFT });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Performance profile/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /Performance profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(targets.setProfile).not.toHaveBeenCalled();
    expect(targets.replacePlan).toHaveBeenCalled();
  });

  it('merges selected entries into the imported plan\'s theatre', async () => {
    renderAnonymous();
    await pickFile({ version: '1.6', flightPlan: PLAN, librarySnapshot: [{ id: 'n', ...base }] });
    await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect(targets.mergeEntries).toHaveBeenCalledWith('caucasus', [{ id: 'n', ...base }]);
  });

  it('shows a validation error and changes nothing', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: 'Invalid flight plan' }) });
    renderAnonymous();
    await pickFile({ version: '1.6', flightPlan: PLAN });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid flight plan'));
    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled();
    expect(targets.replacePlan).not.toHaveBeenCalled();
  });
});
