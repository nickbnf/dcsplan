import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSpaceAssets } from '../contexts/SpaceAssetsContext';
import { ConfirmDialog } from './performance/ProfileControls';

const linkClass =
  'text-xs text-gray-500 hover:text-gray-900 underline font-aero-label';

/** Header login/logout control (D8). */
export const AuthMenu: React.FC = () => {
  const { status, user, login, logout } = useAuth();
  const { status: syncStatus } = useSpaceAssets();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const pending = syncStatus?.pending ?? 0;

  // Logging out clears this device's copy of the space; changes that have not
  // reached the server yet would be lost, so ask first (space-asset-sync).
  const requestLogout = () => {
    if (pending > 0) setConfirmLogout(true);
    else void logout();
  };

  if (status === 'loading') {
    return null;
  }

  if (status === 'authenticated' && user) {
    const avatarUrl =
      user.avatar && user.discord_id
        ? `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar}.png?size=32`
        : null;
    return (
      <div className="flex items-center gap-2">
        {avatarUrl && (
          <img src={avatarUrl} alt="" className="w-6 h-6 rounded-full" />
        )}
        <span className="text-xs font-aero-label text-gray-700">
          {user.display_name ?? 'Signed in'}
        </span>
        <button type="button" onClick={requestLogout} className={linkClass}>
          Log out
        </button>
        {confirmLogout && (
          <ConfirmDialog
            title="Log out with unsent changes?"
            message={`${pending} library or profile change${pending !== 1 ? 's have' : ' has'} not reached the server yet and will be lost if you log out now.`}
            confirmLabel="Log out anyway"
            destructive
            onConfirm={() => { setConfirmLogout(false); void logout(); }}
            onCancel={() => setConfirmLogout(false)}
          />
        )}
      </div>
    );
  }

  return (
    <button type="button" onClick={login} className={linkClass}>
      Sign in with Discord
    </button>
  );
};

export default AuthMenu;
