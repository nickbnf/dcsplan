import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SyncStatus } from '../sync/assetSync';

let auth: { status: string; connectivity: string } = { status: 'authenticated', connectivity: 'online' };
let syncStatus: SyncStatus | null = null;

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../contexts/SpaceAssetsContext', () => ({ useSpaceAssets: () => ({ status: syncStatus }) }));

import { SyncIndicator } from './SyncIndicator';

const ok: SyncStatus = { connectivity: 'online', caughtUp: true, pending: 0, error: null };

beforeEach(() => {
  auth = { status: 'authenticated', connectivity: 'online' };
  syncStatus = ok;
});

describe('SyncIndicator', () => {
  it('shows nothing when connected and caught up', () => {
    render(<SyncIndicator />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows syncing while changes are pending or a pull is outstanding', () => {
    syncStatus = { ...ok, caughtUp: false, pending: 2 };
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Syncing…');
  });

  it('shows offline when the session check is disconnected, with the pending count', () => {
    auth = { status: 'authenticated', connectivity: 'offline' };
    syncStatus = { ...ok, caughtUp: false, pending: 3 };
    render(<SyncIndicator />);
    const el = screen.getByRole('status');
    expect(el).toHaveTextContent('Offline');
    expect(el.getAttribute('title')).toContain('3 change(s)');
  });

  it('shows offline when the sync engine cannot reach the server', () => {
    syncStatus = { ...ok, connectivity: 'offline', caughtUp: false };
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
  });

  it('shows a refused write as a sync error', () => {
    syncStatus = { ...ok, error: 'Failed to save profile (422)' };
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Sync error');
  });

  it('shows nothing for anonymous users', () => {
    auth = { status: 'anonymous', connectivity: 'online' };
    syncStatus = null;
    render(<SyncIndicator />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
