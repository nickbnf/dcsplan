import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const catalogue = {
  theatres: [
    { id: 'germany', name: 'Germany', default_map: 'default', maps: [{ id: 'default', name: 'Default' }, { id: 'vfr', name: 'VFR' }] },
  ],
};

describe('fetchTheatreCatalogue', () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('maps the catalogue to theatre metadata with maps and default map', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => catalogue });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTheatreCatalogue } = await import('./useTheatres');

    const theatres = await fetchTheatreCatalogue();
    expect(theatres).toEqual([
      { id: 'germany', name: 'Germany', defaultMap: 'default', maps: [{ id: 'default', name: 'Default' }, { id: 'vfr', name: 'VFR' }] },
    ]);
  });

  it('fetches once and shares the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => catalogue });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTheatreCatalogue } = await import('./useTheatres');

    await Promise.all([fetchTheatreCatalogue(), fetchTheatreCatalogue()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries after a failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => catalogue });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchTheatreCatalogue } = await import('./useTheatres');

    await expect(fetchTheatreCatalogue()).rejects.toThrow('500');
    await expect(fetchTheatreCatalogue()).resolves.toHaveLength(1);
  });
});
