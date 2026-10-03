import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '../config/api';

export interface AuthUser {
  id: string;
  discord_id: string;
  display_name: string | null;
  avatar: string | null;
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await fetch(getApiUrl('auth/me'), { credentials: 'same-origin' });
      if (!resp.ok) {
        setUser(null);
        setStatus('anonymous');
        return;
      }
      const data = await resp.json();
      if (data.authenticated) {
        setUser(data.user);
        setStatus('authenticated');
      } else {
        setUser(null);
        setStatus('anonymous');
      }
    } catch {
      // Backend unreachable or auth not configured — treat as anonymous.
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(() => {
    // Full-page navigation to the backend, which redirects to Discord.
    window.location.href = getApiUrl('auth/discord/login');
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(getApiUrl('auth/logout'), { method: 'POST', credentials: 'same-origin' });
    } finally {
      // Local data (plan, library, profile) is intentionally left untouched —
      // there is no server copy to fall back on yet.
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
