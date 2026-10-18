import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSpaceAssets } from '../contexts/SpaceAssetsContext';
import { ConfirmDialog } from './performance/ProfileControls';

/**
 * The server ended the session (user-identity: session found invalid on
 * reconnect). With nothing waiting to be sent, leave the signed-in tier at
 * once; otherwise warn first, offering to sign in again, which keeps the
 * device's copy so the pending changes are sent once signed back in.
 */
export const SessionExpiredDialog: React.FC = () => {
  const { sessionExpired, endSession, login } = useAuth();
  const { status } = useSpaceAssets();
  const pending = status?.pending ?? 0;

  useEffect(() => {
    if (sessionExpired && pending === 0) endSession();
  }, [sessionExpired, pending, endSession]);

  if (!sessionExpired || pending === 0) return null;
  return (
    <ConfirmDialog
      title="Your session has ended"
      message={`${pending} library or profile change${pending !== 1 ? 's have' : ' has'} not reached the server. Sign in again to send ${pending !== 1 ? 'them' : 'it'}, or discard ${pending !== 1 ? 'them' : 'it'} and continue without an account.`}
      confirmLabel="Sign in again"
      cancelLabel="Discard changes"
      onConfirm={login}
      onCancel={endSession}
    />
  );
};

export default SessionExpiredDialog;
