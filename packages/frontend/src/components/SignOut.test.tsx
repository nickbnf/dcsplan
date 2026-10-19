/**
 * Leaving the signed-in tier (add-library-profile-sync, task 9.1; spec:
 * space-asset-sync logout, user-identity session ended on reconnect).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { userPrefix } from '../sync/assetCache';

let auth: any;
let pending = 0;

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));

// The sweep test uses the real provider; the UI tests stub the hook.
const realProvider = vi.hoisted(() => ({ useReal: false }));
vi.mock('../contexts/SpaceAssetsContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../contexts/SpaceAssetsContext')>();
  return {
    ...actual,
    useSpaceAssets: () => (realProvider.useReal ? actual.useSpaceAssets() : {
      sync: null, state: null,
      status: { connectivity: 'online', caughtUp: pending === 0, pending, error: null },
    }),
  };
});

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { defaultAircraft } from '../types/flightPlan';
import { flightPlanUtils, isFreshPlan } from '../utils/flightPlanUtils';
import { seedYDoc } from '../utils/yjsFlightPlanBinding';
import { loadLibrary, saveLibrary } from '../utils/libraryStorage';
import { loadPerformance, savePerformance } from '../utils/performanceStorage';
import { readAnonymousPlan } from '../hooks/useYjsFlightPlan';
import { moveOffDevice, readLocalData } from '../import/localSource';
import { AuthMenu } from './AuthMenu';
import { SessionExpiredDialog } from './SessionExpiredDialog';
import { SpaceAssetsProvider } from '../contexts/SpaceAssetsContext';

const USER = { id: 'u1', discord_id: 'd1', display_name: 'Falcon', avatar: null };

beforeEach(() => {
  localStorage.clear();
  pending = 0;
  realProvider.useReal = false;
  auth = {
    status: 'authenticated', user: USER, connectivity: 'online', sessionExpired: false,
    login: vi.fn(), logout: vi.fn(async () => {}), endSession: vi.fn(), refresh: vi.fn(async () => {}),
  };
});

describe('AuthMenu — logout with unsent changes', () => {
  it('logs out at once when nothing is pending', () => {
    render(<AuthMenu />);
    fireEvent.click(screen.getByText('Log out'));
    expect(auth.logout).toHaveBeenCalled();
  });

  it('warns with the count; cancel keeps the session', () => {
    pending = 3;
    render(<AuthMenu />);
    fireEvent.click(screen.getByText('Log out'));
    expect(screen.getByText(/3 library or profile changes have not reached the server/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it('logs out on confirmation', () => {
    pending = 1;
    render(<AuthMenu />);
    fireEvent.click(screen.getByText('Log out'));
    fireEvent.click(screen.getByText('Log out anyway'));
    expect(auth.logout).toHaveBeenCalled();
  });
});

describe('SessionExpiredDialog', () => {
  it('ends the session quietly when nothing is pending', () => {
    auth.sessionExpired = true;
    render(<SessionExpiredDialog />);
    expect(auth.endSession).toHaveBeenCalled();
    expect(screen.queryByText('Your session has ended')).toBeNull();
  });

  it('warns first when changes are pending, offering to sign in again or discard', () => {
    auth.sessionExpired = true;
    pending = 2;
    render(<SessionExpiredDialog />);
    expect(screen.getByText('Your session has ended')).toBeInTheDocument();
    expect(auth.endSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Sign in again'));
    expect(auth.login).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Discard changes'));
    expect(auth.endSession).toHaveBeenCalled();
  });
});

describe('SpaceAssetsProvider — clearing the device on leaving the signed-in tier', () => {
  function seed() {
    localStorage.setItem('dcsplan.library.caucasus', '[{"id":"anon"}]');
    localStorage.setItem('dcsplan.performance', '{"name":"Mine"}');
    localStorage.setItem(userPrefix('u1') + 'entries', '{}');
    localStorage.setItem(userPrefix('u1') + 'planIndex', '{}');
    localStorage.setItem(userPrefix('u1') + 'session', '{}');
  }
  const userKeys = () => Object.keys(localStorage).filter(k => k.startsWith(userPrefix('u1')));

  it('sweeps the user namespace on logout and keeps the anonymous data', () => {
    realProvider.useReal = true;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    seed();
    const { rerender } = render(<SpaceAssetsProvider><div /></SpaceAssetsProvider>);
    auth = { ...auth, status: 'anonymous', user: null };
    rerender(<SpaceAssetsProvider><div /></SpaceAssetsProvider>);
    expect(userKeys()).toEqual([]);
    expect(localStorage.getItem('dcsplan.library.caucasus')).toBe('[{"id":"anon"}]');
    expect(localStorage.getItem('dcsplan.performance')).toBe('{"name":"Mine"}');
  });

  it('does not sweep when the page simply goes away', () => {
    realProvider.useReal = true;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    seed();
    const { unmount } = render(<SpaceAssetsProvider><div /></SpaceAssetsProvider>);
    unmount();
    expect(userKeys().length).toBeGreaterThan(0);
  });
});

describe('Logout after importing local data (user-identity, plan-sync; local-data-migration)', () => {
  async function seedAnonymousPlan(name: string) {
    const doc = new Y.Doc();
    const idb = new IndexeddbPersistence('dcsplan-flightplan-ydoc', doc);
    await idb.whenSynced;
    doc.transact(() => {
      doc.getMap('flightPlan').clear();
      seedYDoc(doc, { ...flightPlanUtils.newFlightPlan('caucasus'), name });
    });
    await new Promise((r) => setTimeout(r, 50));
    await idb.destroy();
  }

  function logOut(rerender: (ui: React.ReactElement) => void) {
    auth = { ...auth, status: 'anonymous', user: null };
    rerender(<SpaceAssetsProvider><div /></SpaceAssetsProvider>);
  }

  it('leaves a fresh anonymous plan once the plan was imported, and keeps what was not imported', async () => {
    realProvider.useReal = true;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    await seedAnonymousPlan('Strike North');
    saveLibrary('caucasus', [{ id: 'e1', type: 'sam_site', lat: 42, lon: 41 }]);
    savePerformance({ ...defaultAircraft(), model: 'F-16C' });

    const { rerender } = render(<SpaceAssetsProvider><div /></SpaceAssetsProvider>);
    const source = (await readLocalData())!;
    // The plan and profile were accepted by the server; the library was not imported.
    await moveOffDevice(source, { plan: 'done', entries: 'skipped', profile: 'done' });
    logOut(rerender);

    const plan = await readAnonymousPlan();
    expect(plan && isFreshPlan(plan)).toBe(true);
    expect(loadPerformance()).toEqual(defaultAircraft());
    expect(loadLibrary('caucasus').map(e => e.id)).toEqual(['e1']);
  });

  it('keeps all the anonymous data when nothing was imported (Not now)', async () => {
    realProvider.useReal = true;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
    await seedAnonymousPlan('Kept Local');
    saveLibrary('syria', [{ id: 'e2', type: 'aaa', lat: 35, lon: 36 }]);

    const { rerender } = render(<SpaceAssetsProvider><div /></SpaceAssetsProvider>);
    logOut(rerender);

    expect((await readAnonymousPlan())?.name).toBe('Kept Local');
    expect(loadLibrary('syria').map(e => e.id)).toEqual(['e2']);
  });
});
