/**
 * Library entry deletion by tier (add-trash-and-soft-delete 6.3; spec:
 * theatre-library, soft-delete). The map is stubbed; the plan and library are
 * small in-memory stand-ins for their contexts.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import type { FlightPlan, LibraryObject } from '../types/flightPlan';

let signedIn = false;
let plan: FlightPlan;
const onFlightPlanUpdate = vi.fn((p: FlightPlan) => { plan = p; });
const deleteEntry = vi.fn();
const ENTRY: LibraryObject = { id: 'e1', type: 'sam_site', lat: 42, lon: 41, name: 'SA-10' };

vi.mock('./LibraryMap', () => ({ default: () => <div data-testid="library-map" /> }));
vi.mock('../contexts/FlightPlanContext', () => ({
  useFlightPlan: () => ({ flightPlan: plan, onFlightPlanUpdate }),
}));
vi.mock('../contexts/LibraryContext', () => ({
  useLibrary: () => ({
    library: [ENTRY], addEntry: vi.fn(), updateEntry: vi.fn(), deleteEntry, setLibrary: vi.fn(),
  }),
  createLibraryEntry: vi.fn(),
}));
vi.mock('../contexts/SpaceAssetsContext', () => ({
  useSpaceAssets: () => (signedIn
    ? { sync: {}, state: null, status: { connectivity: 'online' } }
    : { sync: null, state: null, status: null }),
}));
vi.mock('../api/assetApi', () => ({ countReferences: vi.fn(async () => 2) }));

import { TheatreLibraryPage } from './TheatreLibraryPage';

beforeEach(() => {
  vi.clearAllMocks();
  plan = {
    theatre: 'caucasus', declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0, name: 'P',
    points: [], libraryRefs: [{ uuid: 'e1' }],
  };
});

const openDelete = () => {
  render(<TheatreLibraryPage />);
  fireEvent.click(screen.getByTitle('Delete entry'));
  return screen.getByRole('dialog');
};

describe('Library entry deletion (6.3)', () => {
  it('anonymous: warns about the current plan and removes its reference', () => {
    signedIn = false;
    const dialog = openDelete();
    expect(within(dialog).getByText(/permanently removed/)).toBeInTheDocument();
    expect(within(dialog).getByText(/referenced by the current flight plan/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByText('Delete'));
    expect(deleteEntry).toHaveBeenCalledWith('e1');
    expect(plan.libraryRefs).toEqual([]);
  });

  it('signed-in: moves the entry to the Trash, counts plans, and keeps the reference', async () => {
    signedIn = true;
    const dialog = openDelete();
    expect(within(dialog).getByText(/moves to the Trash/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/referenced by the current flight plan/)).toBeNull();
    expect(await within(dialog).findByText(/Used by 2 flight plans/)).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(dialog).getByText('Delete')); });
    expect(deleteEntry).toHaveBeenCalledWith('e1');
    expect(onFlightPlanUpdate).not.toHaveBeenCalled();
    expect(plan.libraryRefs).toEqual([{ uuid: 'e1' }]);
  });
});
