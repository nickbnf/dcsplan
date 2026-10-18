import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSpaceAssets } from '../contexts/SpaceAssetsContext';

/**
 * Signed-in connection state for the header (space-asset-sync: syncing
 * indication; user-identity: disconnected indication). Shows nothing for
 * anonymous users or when everything is synced.
 */
export const SyncIndicator: React.FC = () => {
  const { status: authStatus, connectivity } = useAuth();
  const { status } = useSpaceAssets();
  if (authStatus !== 'authenticated' || !status) return null;

  const offline = connectivity === 'offline' || status.connectivity === 'offline';
  let label: string | null = null;
  let title = '';
  if (offline) {
    label = 'Offline';
    title = status.pending > 0
      ? `${status.pending} change(s) will be sent when the connection returns.`
      : 'Changes are kept on this device until the connection returns.';
  } else if (status.error) {
    label = 'Sync error';
    title = status.error;
  } else if (!status.caughtUp) {
    label = 'Syncing…';
    title = 'Library and profile changes are being synced.';
  }
  if (!label) return null;

  return (
    <span
      role="status"
      title={title}
      className={`text-xs font-aero-label px-2 py-0.5 rounded ${
        offline || status.error ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {label}
    </span>
  );
};

export default SyncIndicator;
