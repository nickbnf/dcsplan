import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TheatreMetadata } from '../hooks/useTheatres';

const germany: TheatreMetadata = {
  id: 'germany', name: 'Germany', defaultMap: 'default',
  maps: [{ id: 'default', name: 'Default' }, { id: 'vfr', name: 'VFR' }],
};
const syria: TheatreMetadata = {
  id: 'syria', name: 'Syria', defaultMap: 'default',
  maps: [{ id: 'default', name: 'Default' }, { id: 'vfr', name: 'VFR' }],
};

// Fresh module per test: the in-tab choices live in module state.
const load = () => import('./mapChoice');

describe('mapChoice', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('resolves to the default map when nothing is stored', async () => {
    const { resolveMapChoice } = await load();
    expect(resolveMapChoice(germany)).toBe('default');
  });

  it('persists a choice across a reload', async () => {
    const { setMapChoice } = await load();
    setMapChoice('germany', 'vfr');
    vi.resetModules();
    const { resolveMapChoice } = await load();
    expect(resolveMapChoice(germany)).toBe('vfr');
  });

  it('falls back to the default for a map the theatre no longer offers, keeping the stored entry', async () => {
    localStorage.setItem('dcsplan.mapChoice', JSON.stringify({ germany: 'removed' }));
    const { resolveMapChoice } = await load();
    expect(resolveMapChoice(germany)).toBe('default');
    expect(JSON.parse(localStorage.getItem('dcsplan.mapChoice')!)).toEqual({ germany: 'removed' });
  });

  it('keeps choices per theatre', async () => {
    const { setMapChoice, resolveMapChoice } = await load();
    setMapChoice('germany', 'vfr');
    expect(resolveMapChoice(germany)).toBe('vfr');
    expect(resolveMapChoice(syria)).toBe('default');
  });

  it('notifies subscribers on set, until they unsubscribe', async () => {
    const { setMapChoice, subscribeMapChoice } = await load();
    const listener = vi.fn();
    const unsubscribe = subscribeMapChoice(listener);
    setMapChoice('germany', 'vfr');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setMapChoice('germany', 'default');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores corrupt stored data', async () => {
    localStorage.setItem('dcsplan.mapChoice', 'not json');
    const { resolveMapChoice } = await load();
    expect(resolveMapChoice(germany)).toBe('default');
  });

  it('works without storage: default when unread, and follows choices made in the tab', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { setMapChoice, resolveMapChoice } = await load();
    expect(resolveMapChoice(germany)).toBe('default');
    expect(() => setMapChoice('germany', 'vfr')).not.toThrow();
    expect(resolveMapChoice(germany)).toBe('vfr');
  });
});
