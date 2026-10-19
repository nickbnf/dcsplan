/** Sign-in import of local data (add-local-data-import task 6.2; spec:
 *  local-data-migration). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { defaultAircraft } from '../../types/flightPlan';
import { flightPlanUtils } from '../../utils/flightPlanUtils';
import type { ImportSource } from '../../import/types';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => ({ ...(await (orig() as Promise<any>)), useNavigate: () => navigate }));

const auth: any = { status: 'authenticated' };
vi.mock('../../contexts/AuthContext', async (orig) => ({ ...(await (orig() as Promise<any>)), useAuth: () => auth }));

const fakeSync = { getState: () => ({ entries: {}, profiles: {} }) };
vi.mock('../../contexts/SpaceAssetsContext', () => ({ useSpaceAssets: () => ({ sync: fakeSync, state: {}, status: null }) }));

const sel = { refreshPlans: vi.fn(async () => []), notePlanCreated: vi.fn() };
vi.mock('../../contexts/PlanSelectionContext', () => ({ usePlanSelection: () => sel }));

let local: ImportSource | Error | null = null;
vi.mock('../../import/localSource', () => ({
  readLocalData: async () => { if (local instanceof Error) throw local; return local; },
}));

const isSpaceEmpty = vi.fn();
const importLocalData = vi.fn();
vi.mock('../../import/localImport', async (orig) => ({
  ...(await (orig() as Promise<any>)),
  isSpaceEmpty: (...a: unknown[]) => isSpaceEmpty(...a),
  importLocalData: (...a: unknown[]) => importLocalData(...a),
}));

import { SIGNING_IN_KEY } from '../../contexts/AuthContext';
import { LocalDataMigration } from './LocalDataMigration';

const LOCAL: ImportSource = {
  kind: 'local',
  plan: { ...flightPlanUtils.newFlightPlan('caucasus'), name: 'Strike North' },
  planId: 'AAAAAAAAAAA5',
  entries: {},
  profile: { id: 'p-local', aircraft: { ...defaultAircraft(), model: 'F-16C' } },
};
const DONE = {
  plan: 'done', entries: 'skipped', profile: 'done',
  created: { id: 'AAAAAAAAAAA5', name: 'Strike North', theatre: 'caucasus' },
};

beforeEach(() => {
  sessionStorage.clear();
  navigate.mockReset();
  sel.notePlanCreated.mockReset();
  isSpaceEmpty.mockReset();
  importLocalData.mockReset();
  auth.status = 'authenticated';
  local = LOCAL;
});

describe('LocalDataMigration', () => {
  it('imports everything silently into an empty account and opens the plan', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    isSpaceEmpty.mockResolvedValue(true);
    importLocalData.mockResolvedValue(DONE);
    render(<LocalDataMigration />);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/p/AAAAAAAAAAA5/strike-north'));
    expect(importLocalData.mock.calls[0][1]).toEqual({ plan: true, entries: true, profile: true });
    expect(screen.queryByTestId('import-chooser')).toBeNull();
    expect(sessionStorage.getItem(SIGNING_IN_KEY)).toBeNull();
  });

  it('shows the chooser for an account that holds data, or whose contents are unknown', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    isSpaceEmpty.mockResolvedValue(false); // also what an unreadable space yields
    render(<LocalDataMigration />);
    await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /Flight plan “Strike North”/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Performance profile/ })).toBeChecked();
    expect(importLocalData).not.toHaveBeenCalled();
  });

  it('Not now changes nothing', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    isSpaceEmpty.mockResolvedValue(false);
    render(<LocalDataMigration />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Not now' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    await waitFor(() => expect(screen.queryByTestId('import-chooser')).toBeNull());
    expect(importLocalData).not.toHaveBeenCalled();
  });

  it('imports the chosen items from the chooser', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    isSpaceEmpty.mockResolvedValue(false);
    importLocalData.mockResolvedValue({ ...DONE, profile: 'skipped' });
    render(<LocalDataMigration />);
    await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('checkbox', { name: /Performance profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(importLocalData).toHaveBeenCalled());
    expect(importLocalData.mock.calls[0][1]).toEqual({ plan: true, entries: true, profile: false });
  });

  it('does nothing on a reload (no sign-in mark)', async () => {
    isSpaceEmpty.mockResolvedValue(true);
    render(<LocalDataMigration />);
    await new Promise((r) => setTimeout(r, 20));
    expect(isSpaceEmpty).not.toHaveBeenCalled();
    expect(importLocalData).not.toHaveBeenCalled();
  });

  it('does nothing on a device with no local data', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    local = null;
    render(<LocalDataMigration />);
    await new Promise((r) => setTimeout(r, 20));
    expect(isSpaceEmpty).not.toHaveBeenCalled();
    expect(screen.queryByTestId('import-chooser')).toBeNull();
  });

  it('does nothing while anonymous', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    auth.status = 'anonymous';
    render(<LocalDataMigration />);
    await new Promise((r) => setTimeout(r, 20));
    expect(isSpaceEmpty).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SIGNING_IN_KEY)).toBe('1');
  });

  it('offers what is left when a silent import partly fails', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    isSpaceEmpty.mockResolvedValue(true);
    importLocalData.mockImplementation(async () => {
      local = { ...LOCAL, profile: null };   // the profile moved; the plan is still local
      return { plan: 'failed', entries: 'skipped', profile: 'done', error: 'offline' };
    });
    render(<LocalDataMigration />);
    await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /Flight plan/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Performance profile/ })).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('survives local data that cannot be read', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    local = new Error('IndexedDB unavailable');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<LocalDataMigration />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.queryByTestId('import-chooser')).toBeNull();
    expect(isSpaceEmpty).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('offers what remains when a silent import throws', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    isSpaceEmpty.mockResolvedValue(true);
    importLocalData.mockRejectedValue(new Error('reset failed'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<LocalDataMigration />);
    await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
    expect(navigate).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('the chooser reports an import that throws and stays usable', async () => {
    sessionStorage.setItem(SIGNING_IN_KEY, '1');
    isSpaceEmpty.mockResolvedValue(false);
    importLocalData.mockRejectedValue(new Error('reset failed'));
    render(<LocalDataMigration />);
    await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('reset failed'));
    expect(screen.getByRole('button', { name: 'Import' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeEnabled();
  });
});
