import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const linkClass =
  'text-xs text-gray-500 hover:text-gray-900 underline font-aero-label';

/** Header login/logout control (D8). */
export const AuthMenu: React.FC = () => {
  const { status, user, login, logout } = useAuth();

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
        <button type="button" onClick={() => void logout()} className={linkClass}>
          Log out
        </button>
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
