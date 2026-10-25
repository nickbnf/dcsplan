/**
 * The version history dialog (add-version-history task 7.3; design D10;
 * spec: version-history — version history panel, restoring a version).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { PlanVersion, PlanVersions } from '../../api/planApi';

const flightPlanContext: {
  flightPlanId: string;
  restoreVersion?: (rev: number) => Promise<PlanVersion | null>;
} = { flightPlanId: 'PLANAAAAAAA1' };
const auth = { connectivity: 'online' as 'online' | 'offline' };
const listVersions = vi.fn<[string], Promise<PlanVersions>>();

vi.mock('../../contexts/FlightPlanContext', () => ({ useOptionalFlightPlan: () => flightPlanContext }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../api/planApi', async (importActual) => ({
  ...(await importActual<typeof import('../../api/planApi')>()),
  listVersions: (planId: string) => listVersions(planId),
}));

import { VersionHistoryDialog } from './VersionHistoryDialog';

const version = (rev: number, editor = 'Falcon'): PlanVersion => ({
  rev, finalizedAt: `2026-07-2${rev}T14:32:00+00:00`, restoredFrom: null,
  editors: [{ id: 'u1', displayName: editor }],
});

beforeEach(() => {
  flightPlanContext.restoreVersion = vi.fn().mockResolvedValue(version(4));
  auth.connectivity = 'online';
  listVersions.mockReset();
  listVersions.mockResolvedValue({ versions: [version(3), version(2), version(1)], pending: false });
});

function open() {
  render(<VersionHistoryDialog />);
  fireEvent.click(screen.getByRole('button', { name: 'History' }));
}

describe('VersionHistoryDialog', () => {
  it('renders nothing for a plan without version history', () => {
    delete flightPlanContext.restoreVersion;
    const { container } = render(<VersionHistoryDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('lists the versions newest first', async () => {
    open();
    await screen.findByText('Rev 3');
    const labels = screen.getAllByText(/^Rev \d$/).map(el => el.textContent);
    expect(labels).toEqual(['Rev 3', 'Rev 2', 'Rev 1']);
    expect(screen.getAllByTestId('version-detail')[0].textContent).toContain('Falcon');
    expect(listVersions).toHaveBeenCalledWith('PLANAAAAAAA1');
    // The newest version with nothing pending is current: nothing to restore.
    expect(screen.queryByRole('button', { name: 'Restore Rev 3' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore Rev 2' })).toBeTruthy();
  });

  it('says when there are changes not yet in a version', async () => {
    listVersions.mockResolvedValue({ versions: [version(3)], pending: true });
    open();
    expect((await screen.findByTestId('pending-changes')).textContent).toContain('since Rev 3');
    expect(screen.getByRole('button', { name: 'Restore Rev 3' })).toBeTruthy();
  });

  it('shows no pending line when there is nothing pending', async () => {
    open();
    await screen.findByText('Rev 3');
    expect(screen.queryByTestId('pending-changes')).toBeNull();
  });

  it('cancelling the confirmation restores nothing', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Rev 2' }));
    expect(screen.getByText('Restore Rev 2?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(flightPlanContext.restoreVersion).not.toHaveBeenCalled();
    expect(await screen.findByText('Rev 3')).toBeTruthy();
  });

  it('confirming restores the version and closes', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Rev 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Rev 2' }));
    await waitFor(() => expect(flightPlanContext.restoreVersion).toHaveBeenCalledWith(2));
    await waitFor(() => expect(screen.queryByText('Restore Rev 2?')).toBeNull());
  });

  it('shows a failed restore and stays open', async () => {
    flightPlanContext.restoreVersion = vi.fn().mockRejectedValue(new Error('Failed to save a version (503)'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore Rev 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restore Rev 2' }));
    expect((await screen.findByRole('alert')).textContent).toContain('503');
  });

  it('is unavailable offline: no list and no restore', async () => {
    auth.connectivity = 'offline';
    open();
    expect((await screen.findByRole('status')).textContent).toContain('unavailable offline');
    expect(listVersions).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^Restore/ })).toBeNull();
  });

  it('treats an unreachable server as offline', async () => {
    listVersions.mockRejectedValue(new TypeError('Failed to fetch'));
    open();
    expect((await screen.findByRole('status')).textContent).toContain('unavailable offline');
  });
});
