import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('resolves to anonymous when /auth/me is unauthenticated', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false }),
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(result.current.user).toBeNull();
  });

  it('resolves to authenticated and exposes the user', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authenticated: true,
        user: { id: 'u1', discord_id: 'd1', display_name: 'Falcon', avatar: 'a' },
      }),
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user?.display_name).toBe('Falcon');
  });

  it('logout returns to anonymous and leaves local data untouched', async () => {
    localStorage.setItem('dcsplan-flightplan', 'PLAN');
    localStorage.setItem('dcsplan.performance', 'PERF');
    const fetchMock = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('auth/logout')) {
        return Promise.resolve({ ok: true, json: async () => ({ authenticated: false }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          authenticated: true,
          user: { id: 'u1', discord_id: 'd1', display_name: 'Falcon', avatar: null },
        }),
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('auth/logout'),
      expect.objectContaining({ method: 'POST' }),
    );
    // Local data is preserved on logout (no server copy to fall back on).
    expect(localStorage.getItem('dcsplan-flightplan')).toBe('PLAN');
    expect(localStorage.getItem('dcsplan.performance')).toBe('PERF');
  });

  describe('offline start (user-identity: signed-in state survives starting offline)', () => {
    const FALCON = { id: 'u1', discord_id: 'd1', display_name: 'Falcon', avatar: null };
    const signedIn = () => Promise.resolve({ ok: true, status: 200, json: async () => ({ authenticated: true, user: FALCON }) });

    async function rememberFalcon() {
      global.fetch = vi.fn(signedIn) as unknown as typeof fetch;
      const { result, unmount } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe('authenticated'));
      unmount();
    }

    it('starts signed in and disconnected when the server is unreachable and a user is remembered', async () => {
      await rememberFalcon();
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe('authenticated'));
      expect(result.current.connectivity).toBe('offline');
      expect(result.current.user?.display_name).toBe('Falcon');
    });

    it('treats a 5xx like an unreachable server', async () => {
      await rememberFalcon();
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.connectivity).toBe('offline'));
      expect(result.current.status).toBe('authenticated');
    });

    it('starts anonymous offline when nobody was signed in on the device', async () => {
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe('anonymous'));
    });

    it('clears the disconnected state once the server confirms the session', async () => {
      await rememberFalcon();
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.connectivity).toBe('offline'));

      global.fetch = vi.fn(signedIn) as unknown as typeof fetch;
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      await waitFor(() => expect(result.current.connectivity).toBe('online'));
      expect(result.current.status).toBe('authenticated');
    });

    it('ends the signed-in state when the server reports the session invalid on reconnect', async () => {
      await rememberFalcon();
      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const { result } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.connectivity).toBe('offline'));

      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      // Flagged first, so unsent changes can be warned about; then ended.
      await waitFor(() => expect(result.current.sessionExpired).toBe(true));
      expect(result.current.status).toBe('authenticated');
      act(() => result.current.endSession());
      expect(result.current.status).toBe('anonymous');
      expect(localStorage.getItem('dcsplan.lastUser')).toBeNull();
    });

    it('logout forgets the remembered user, so a later offline start is anonymous', async () => {
      global.fetch = vi.fn(signedIn) as unknown as typeof fetch;
      const { result, unmount } = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(result.current.status).toBe('authenticated'));
      await act(async () => {
        await result.current.logout();
      });
      unmount();

      global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      const second = renderHook(() => useAuth(), { wrapper });
      await waitFor(() => expect(second.result.current.status).toBe('anonymous'));
    });
  });
});
