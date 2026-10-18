import React, { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useAuth } from './AuthContext';
import { AssetSync, type SyncStatus } from '../sync/assetSync';
import { sweepUser, type AssetCacheState } from '../sync/assetCache';

/**
 * The signed-in user's synced libraries and profiles (capability:
 * space-asset-sync). One AssetSync engine per signed-in user, started while
 * they are signed in. Anonymous users get `sync: null` and keep their
 * device-local library and profile (AD-9).
 */
interface SpaceAssetsValue {
  sync: AssetSync | null;
  state: AssetCacheState | null;
  status: SyncStatus | null;
}

const SpaceAssetsContext = createContext<SpaceAssetsValue | null>(null);

const noopSubscribe = () => () => {};
const nullSnapshot = () => null;

export const SpaceAssetsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, user, connectivity, refresh } = useAuth();
  const userId = status === 'authenticated' ? user?.id ?? null : null;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sync = useMemo(() => (userId ? new AssetSync(userId, { onUnauthorized: () => void refresh() }) : null), [userId]);

  useEffect(() => {
    if (!sync) return;
    sync.start();
    return () => sync.stop();
  }, [sync]);

  // Leaving the signed-in tier (logout, or an ended session) clears the user's
  // cached library, profiles, plan index and remembered session from the
  // device (space-asset-sync, D11). Closing the page is not a transition, so
  // the copy survives for the next start.
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (previousUser.current && previousUser.current !== userId && status === 'anonymous') {
      sweepUser(previousUser.current);
    }
    previousUser.current = userId;
  }, [userId, status]);

  // The session was confirmed again: retry pending writes and pull now.
  useEffect(() => {
    if (sync && connectivity === 'online') sync.nudge();
  }, [sync, connectivity]);

  const state = useSyncExternalStore(sync?.subscribe ?? noopSubscribe, sync?.getState ?? nullSnapshot);
  const syncStatus = useSyncExternalStore(sync?.subscribe ?? noopSubscribe, sync?.getStatus ?? nullSnapshot);

  const value = useMemo(() => ({ sync, state, status: syncStatus }), [sync, state, syncStatus]);
  return <SpaceAssetsContext.Provider value={value}>{children}</SpaceAssetsContext.Provider>;
};

const ANONYMOUS: SpaceAssetsValue = { sync: null, state: null, status: null };

/** The synced assets, or `sync: null` in the anonymous tier (or outside a provider). */
export const useSpaceAssets = (): SpaceAssetsValue => useContext(SpaceAssetsContext) ?? ANONYMOUS;
