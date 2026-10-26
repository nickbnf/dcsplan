import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const theatreFiles: Record<string, unknown> = {
  germany: { theatre_name: 'Germany', default_map: 'default', navigation: { mode: 'projected', projection: 'transverse_mercator', central_meridian: 21 } },
  caucasus: { theatre_name: 'Caucasus', default_map: 'default', navigation: { mode: 'geographic', projection: 'mercator', central_meridian: 42 } },
};

describe('useTheatreNavigation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const theatre = /theatres\/([a-z]+)\/theatre\.json/.exec(url)![1];
      return { ok: true, json: async () => theatreFiles[theatre] };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("builds the theatre's navigation projection and mode from theatre.json", async () => {
    const { useTheatreNavigation } = await import('./useTheatreNavigation');
    const { result } = renderHook(() => useTheatreNavigation('germany'));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current!.navigationMode).toBe('projected');
    expect(result.current!.projection.getCode()).toBe('custom:tmerc_21');
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/theatres\/germany\/theatre\.json$/), expect.anything());
  });

  it('never fetches a map config', async () => {
    const { useTheatreNavigation } = await import('./useTheatreNavigation');
    const { result } = renderHook(() => useTheatreNavigation('germany'));
    await waitFor(() => expect(result.current).not.toBeNull());
    for (const [url] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).not.toMatch(/maps\//);
    }
  });

  it("does not return the previous theatre's settings while the new ones load", async () => {
    const { useTheatreNavigation } = await import('./useTheatreNavigation');
    const { result, rerender } = renderHook(({ theatre }) => useTheatreNavigation(theatre), { initialProps: { theatre: 'germany' } });
    await waitFor(() => expect(result.current).not.toBeNull());

    rerender({ theatre: 'caucasus' });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.navigationMode).toBe('geographic'));
    expect(result.current!.projection.getCode()).toBe('EPSG:3857');
  });
});
