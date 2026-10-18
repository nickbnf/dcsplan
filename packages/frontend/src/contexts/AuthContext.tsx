import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getApiUrl } from '../config/api';
import { userPrefix } from '../sync/assetCache';

export interface AuthUser {
  id: string;
  discord_id: string;
  display_name: string | null;
  avatar: string | null;
}

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

/** Whether the server can be reached. 'offline' with 'authenticated' is the
 * signed-in-but-disconnected state (user-identity: offline start). */
export type Connectivity = 'online' | 'offline';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  connectivity: Connectivity;
  /** The server ended a signed-in session (e.g. on reconnect). The app stays
   * signed in until `endSession` is called, so unsent changes can be warned
   * about first (user-identity). */
  sessionExpired: boolean;
  endSession: () => void;
  login: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// The device remembers the last signed-in user so an offline start can resume
// their signed-in tier (design D9). Cleared on logout or when the server ends
// the session.
const LAST_USER_KEY = 'dcsplan.lastUser';
const sessionKey = (userId: string) => `${userPrefix(userId)}session`;
const MAX_RETRY_MS = 60_000;

function rememberUser(user: AuthUser): void {
  try {
    localStorage.setItem(LAST_USER_KEY, user.id);
    localStorage.setItem(sessionKey(user.id), JSON.stringify({ user }));
  } catch {
    // Storage unavailable: offline start simply falls back to anonymous.
  }
}

function rememberedUser(): AuthUser | null {
  try {
    const id = localStorage.getItem(LAST_USER_KEY);
    if (!id) return null;
    const raw = localStorage.getItem(sessionKey(id));
    return raw ? (JSON.parse(raw).user as AuthUser) : null;
  } catch {
    return null;
  }
}

function forgetUser(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    // ignore
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [connectivity, setConnectivity] = useState<Connectivity>('online');
  const [sessionExpired, setSessionExpired] = useState(false);
  const statusRef = useRef<AuthStatus>('loading');
  statusRef.current = status;
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const signedOut = useCallback(() => {
    forgetUser();
    setUser(null);
    setStatus('anonymous');
    setConnectivity('online');
    setSessionExpired(false);
  }, []);

  /** The server refused the session. A fresh start goes anonymous at once; a
   * session that was in use is flagged, so the UI can warn before ending it. */
  const refused = useCallback(() => {
    if (statusRef.current === 'authenticated') setSessionExpired(true);
    else signedOut();
  }, [signedOut]);

  /** The server could not be reached: resume the remembered user, disconnected,
   * and keep retrying. With nobody remembered, start anonymous. */
  const unreachable = useCallback(() => {
    const remembered = rememberedUser();
    if (!remembered) {
      setUser(null);
      setStatus('anonymous');
      return;
    }
    setUser(remembered);
    setStatus('authenticated');
    setConnectivity('offline');
    retryDelay.current = Math.min(MAX_RETRY_MS, retryDelay.current ? retryDelay.current * 2 : 2_000);
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => void refreshRef.current(), retryDelay.current);
  }, []);

  const refresh = useCallback(async () => {
    let resp: Response;
    try {
      resp = await fetch(getApiUrl('auth/me'), { credentials: 'same-origin' });
    } catch {
      unreachable();
      return;
    }
    if (resp.status >= 500) {
      unreachable();
      return;
    }
    retryDelay.current = 0;
    if (retryTimer.current) clearTimeout(retryTimer.current);
    if (!resp.ok) {
      // A refusal (e.g. 401, or auth not configured): the session is not valid.
      refused();
      return;
    }
    const data = await resp.json();
    if (data.authenticated) {
      rememberUser(data.user);
      setUser(data.user);
      setStatus('authenticated');
      setConnectivity('online');
      setSessionExpired(false);
    } else {
      refused();
    }
  }, [unreachable, refused]);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    const onOnline = () => void refreshRef.current();
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [refresh]);

  const login = useCallback(() => {
    // Full-page navigation to the backend, which redirects to Discord.
    window.location.href = getApiUrl('auth/discord/login');
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(getApiUrl('auth/logout'), { method: 'POST', credentials: 'same-origin' });
    } catch {
      // Offline: the session cookie is ended server-side on its own expiry.
    } finally {
      // The anonymous local data (plan, library, profile) is left untouched;
      // the signed-in caches are cleared by their owners on this transition.
      signedOut();
    }
  }, [signedOut]);

  return (
    <AuthContext.Provider value={{ status, user, connectivity, sessionExpired, endSession: signedOut, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
