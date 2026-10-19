import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const navigate = vi.fn();
vi.mock('react-router-dom', async (orig) => {
  const mod = await (orig() as Promise<any>);
  return { ...mod, useNavigate: () => navigate };
});

vi.mock('../hooks/useTheatres', () => ({
  useTheatres: () => ({
    theatres: [{ id: 'caucasus', name: 'Caucasus' }, { id: 'nevada', name: 'Nevada' }],
    isLoading: false,
    error: null,
  }),
}));

const sel: any = {};
vi.mock('../contexts/PlanSelectionContext', () => ({
  usePlanSelection: () => sel,
}));

const assets: any = { sync: null, state: null, status: null };
vi.mock('../contexts/SpaceAssetsContext', () => ({ useSpaceAssets: () => assets }));

const auth: any = { connectivity: 'online' };
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

const importIntoSpace = vi.fn();
vi.mock('../import/spaceDestination', () => ({
  importIntoSpace: (...args: unknown[]) => importIntoSpace(...args),
  spaceHeld: () => ({ entries: () => [], hasProfile: () => false }),
}));

let localData: any = null;
const moveOffDevice = vi.fn(async () => {});
vi.mock('../import/localSource', () => ({
  readLocalData: async () => localData,
  moveOffDevice: (...a: unknown[]) => moveOffDevice(...(a as [])),
}));

import { waitFor } from '@testing-library/react';
import PlansHomePage from './PlansHomePage';

const plan = (id: string, name: string, theatre = 'caucasus') => ({
  id, name, theatre, updatedAt: new Date().toISOString(), lastEditor: null,
});

beforeEach(() => {
  navigate.mockClear();
  Object.assign(sel, {
    plans: [plan('AAAAAAAAAAA1', 'Ingress Alpha'), plan('AAAAAAAAAAA2', 'Strike Batumi', 'nevada')],
    newDraft: vi.fn(() => 'AAAAAAAAAAA9'),
    refreshPlans: vi.fn(async () => []),
    notePlanCreated: vi.fn(),
  });
  Object.assign(assets, { sync: {}, state: {}, status: { connectivity: 'online' } });
  auth.connectivity = 'online';
  importIntoSpace.mockReset();
  localData = null;
});

describe('PlansHomePage', () => {
  it('lists the space plans with name and theatre', () => {
    render(<PlansHomePage />);
    expect(screen.getByText('Ingress Alpha')).toBeInTheDocument();
    expect(screen.getByText('Strike Batumi')).toBeInTheDocument();
    expect(screen.getByText(/Nevada/)).toBeInTheDocument();
  });

  it('selecting a plan opens its address', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByText('Ingress Alpha'));
    expect(navigate).toHaveBeenCalledWith('/p/AAAAAAAAAAA1/ingress-alpha');
  });

  it('offers no rename control', () => {
    render(<PlansHomePage />);
    expect(screen.queryByRole('button', { name: /rename/i })).not.toBeInTheDocument();
  });

  it('creating a plan makes a draft and opens its address', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /new plan/i }));
    fireEvent.change(screen.getByPlaceholderText('Flight plan name'), { target: { value: 'Fresh Plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(sel.newDraft).toHaveBeenCalledWith('caucasus', 'Fresh Plan');
    expect(navigate).toHaveBeenCalledWith('/p/AAAAAAAAAAA9/fresh-plan');
  });

  it('allows a New-plan name that another plan already uses', () => {
    render(<PlansHomePage />);
    fireEvent.click(screen.getByRole('button', { name: /new plan/i }));
    fireEvent.change(screen.getByPlaceholderText('Flight plan name'), { target: { value: 'Ingress Alpha' } });
    expect(screen.queryByText('Name must be unique.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  });
});

describe('PlansHomePage — freshness', () => {
  it('re-fetches the plan list each time the home is shown (renames from elsewhere)', () => {
    const { unmount } = render(<PlansHomePage />);
    expect(sel.refreshPlans).toHaveBeenCalledTimes(1);
    unmount();
    render(<PlansHomePage />);
    expect(sel.refreshPlans).toHaveBeenCalledTimes(2);
  });

  it('keeps showing the list it has if the re-fetch fails (offline)', async () => {
    sel.refreshPlans = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    render(<PlansHomePage />);
    expect(await screen.findByText('Ingress Alpha')).toBeInTheDocument();
  });
});

describe('PlansHomePage — plan file import (plan-import)', () => {
  const FILE_PLAN = {
    theatre: 'caucasus', points: [], declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0, name: 'From File',
  };

  async function importAFile() {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ flightPlan: FILE_PLAN }) });
    fireEvent.click(screen.getByRole('button', { name: /import/i }));
    const json = JSON.stringify({ version: '1.6', flightPlan: FILE_PLAN });
    const file = new File([json], 'plan.json');
    (file as any).text = () => Promise.resolve(json);
    fireEvent.change(document.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByTestId('import-chooser')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  }

  it('offers Import next to New plan', () => {
    render(<PlansHomePage />);
    expect(screen.getByRole('button', { name: /import/i })).toBeEnabled();
  });

  it('adds the imported plan to the list and opens its address, leaving existing plans alone', async () => {
    importIntoSpace.mockResolvedValue({
      plan: 'done', entries: 'skipped', profile: 'skipped',
      created: { id: 'AAAAAAAAAAA7', name: 'From File', theatre: 'caucasus' },
    });
    render(<PlansHomePage />);
    await importAFile();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/p/AAAAAAAAAAA7/from-file'));
    expect(sel.notePlanCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 'AAAAAAAAAAA7', name: 'From File' }));
    const [source, selection] = importIntoSpace.mock.calls[0];
    expect(source.plan.name).toBe('From File');
    expect(selection.plan).toBe(true);
    expect(sel.newDraft).not.toHaveBeenCalled();
  });

  it('keeps the dialog open with an error when the plan could not be created', async () => {
    importIntoSpace.mockResolvedValue({ plan: 'failed', entries: 'done', profile: 'skipped', error: 'Failed to create plan (500)' });
    render(<PlansHomePage />);
    await importAFile();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Failed to create plan (500)'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('is disabled while offline, with a hint', () => {
    auth.connectivity = 'offline';
    render(<PlansHomePage />);
    const button = screen.getByRole('button', { name: /import/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Importing a plan needs a connection');
  });
});

describe('PlansHomePage — local data from this device (local-data-migration)', () => {
  const LOCAL = {
    kind: 'local',
    plan: { theatre: 'caucasus', points: [], declination: 0, bankAngle: 45, initTimeSec: 0, initFob: 0, name: 'Old Local' },
    planId: 'AAAAAAAAAAA6',
    entries: { caucasus: [{ id: 'e1', type: 'sam_site', lat: 42, lon: 41 }] },
    profile: null,
  };

  it('offers no banner when the device holds no local data', async () => {
    render(<PlansHomePage />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole('button', { name: /import local data/i })).toBeNull();
  });

  it('offers the banner, and the chooser, while local data remains', async () => {
    localData = LOCAL;
    render(<PlansHomePage />);
    fireEvent.click(await screen.findByRole('button', { name: /import local data from this device/i }));
    expect(screen.getByRole('checkbox', { name: /Flight plan “Old Local”/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Library objects \(1\)/ })).toBeChecked();
  });

  it('removes the banner once everything is imported', async () => {
    localData = LOCAL;
    importIntoSpace.mockImplementation(async () => {
      localData = null;
      return { plan: 'done', entries: 'done', profile: 'skipped', created: { id: 'AAAAAAAAAAA6', name: 'Old Local', theatre: 'caucasus' } };
    });
    render(<PlansHomePage />);
    fireEvent.click(await screen.findByRole('button', { name: /import local data from this device/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /import local data/i })).toBeNull());
    expect(navigate).toHaveBeenCalledWith('/p/AAAAAAAAAAA6/old-local');
  });

  it('after a partial failure, offers only what remains', async () => {
    localData = LOCAL;
    importIntoSpace.mockImplementation(async () => {
      localData = { ...LOCAL, entries: {} };   // the library moved; the plan did not
      return { plan: 'failed', entries: 'done', profile: 'skipped', error: 'offline' };
    });
    render(<PlansHomePage />);
    fireEvent.click(await screen.findByRole('button', { name: /import local data from this device/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('not imported'));
    expect(screen.getByRole('checkbox', { name: /Flight plan/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Library objects/ })).toBeNull();
  });
});
