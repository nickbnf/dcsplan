/**
 * The Trash view (add-trash-and-soft-delete 7.2; spec: soft-delete). APIs and
 * contexts are mocked; each test sets what the server holds.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { defaultAircraft } from '../types/flightPlan';

const auth: any = { connectivity: 'online' };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
const pull = vi.fn(async () => {});
vi.mock('../contexts/SpaceAssetsContext', () => ({
  useSpaceAssets: () => ({ sync: { pull }, state: null, status: { connectivity: auth.connectivity } }),
}));
const notePlanCreated = vi.fn();
vi.mock('../contexts/PlanSelectionContext', () => ({ usePlanSelection: () => ({ notePlanCreated }) }));
vi.mock('../hooks/useTheatres', () => ({
  useTheatres: () => ({ theatres: [{ id: 'caucasus', name: 'Caucasus' }], isLoading: false, error: null }),
}));

let trash: any;
let role = 'owner';
vi.mock('../api/planApi', async (orig) => ({
  ...(await (orig() as Promise<any>)),
  getTrash: vi.fn(async () => trash),
  getMySpace: vi.fn(async () => ({ id: 's1', kind: 'personal', role })),
  restorePlan: vi.fn(async (id: string) => ({ id, name: 'Alpha', theatre: 'caucasus', updatedAt: 't', lastEditor: null })),
}));
vi.mock('../api/assetApi', () => ({
  restoreEntry: vi.fn(async () => ({})),
  restoreProfile: vi.fn(async () => ({})),
}));

import TrashPage from './TrashPage';
import * as planApi from '../api/planApi';
import * as assetApi from '../api/assetApi';

const FULL = {
  plans: [{ id: 'P1', name: 'Alpha', theatre: 'caucasus', deletedAt: '2026-10-18T10:00:00+00:00' }],
  entries: [{
    id: 'e1', libraryId: 'lib1', theatre: 'caucasus', deletedAt: '2026-10-20T10:00:00+00:00',
    entry: { id: 'e1', type: 'sam_site', lat: 42, lon: 41, name: 'SA-10' },
  }],
  profiles: [{
    id: 'pr1', deletedAt: '2026-10-19T10:00:00+00:00',
    profile: { id: 'pr1', aircraft: { ...defaultAircraft(), model: 'F-15E' } },
  }],
  retentionDays: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.connectivity = 'online';
  role = 'owner';
  trash = FULL;
});

const names = () => screen.getAllByRole('listitem').map((li) => li.querySelector('.font-medium')!.textContent);

describe('TrashPage (7.2)', () => {
  it('lists all three kinds, newest deletion first, with kind, name and date', async () => {
    render(<TrashPage />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(names()).toEqual(['SA-10', expect.stringContaining('F-15E'), 'Alpha']);
    const [entry, profile, plan] = screen.getAllByRole('listitem');
    expect(entry).toHaveTextContent('Library object · Caucasus · deleted');
    expect(profile).toHaveTextContent('Profile · deleted');
    expect(plan).toHaveTextContent('Flight plan · Caucasus · deleted');
    expect(screen.getByText(/removed for good 30 days after deletion/)).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    trash = { plans: [], entries: [], profiles: [], retentionDays: 30 };
    render(<TrashPage />);
    expect(await screen.findByText('The Trash is empty.')).toBeInTheDocument();
  });

  it('needs a connection', () => {
    auth.connectivity = 'offline';
    render(<TrashPage />);
    expect(screen.getByText(/The Trash needs a connection/)).toBeInTheDocument();
    expect(planApi.getTrash).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('restoring a plan lists it again and removes the row', async () => {
    render(<TrashPage />);
    const button = await screen.findByRole('button', { name: 'Restore Alpha' });
    trash = { ...FULL, plans: [] };
    fireEvent.click(button);
    await waitFor(() => expect(notePlanCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'P1' })));
    expect(planApi.restorePlan).toHaveBeenCalledWith('P1');
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
  });

  it('restoring an entry or profile pulls the asset feed', async () => {
    render(<TrashPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore SA-10' }));
    await waitFor(() => expect(assetApi.restoreEntry).toHaveBeenCalledWith('lib1', 'e1'));
    await waitFor(() => expect(pull).toHaveBeenCalled());
    const profileRow = screen.getAllByRole('listitem').find((li) => li.textContent?.includes('F-15E'))!;
    fireEvent.click(within(profileRow).getByRole('button'));
    await waitFor(() => expect(assetApi.restoreProfile).toHaveBeenCalledWith('pr1'));
  });

  it('a member who may not restore sees the list without Restore', async () => {
    role = 'member';
    render(<TrashPage />);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3));
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('a failed restore is reported', async () => {
    (planApi.restorePlan as any).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<TrashPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Alpha' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('"Alpha" could not be restored');
  });
});
