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
});
