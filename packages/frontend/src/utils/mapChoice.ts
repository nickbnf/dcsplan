import type { TheatreMetadata } from '../hooks/useTheatres';

/**
 * The map chosen for each theatre, on this device only (add-theatre-maps D5).
 * A display preference, not one of the space-owned entities: it is not synced,
 * not stored in the plan, and not part of the local-data import.
 */
const MAP_CHOICE_KEY = 'dcsplan.mapChoice';

type MapChoices = Record<string, string>;

const listeners = new Set<() => void>();

// Choices set in this tab, so views follow them even when storage is unavailable.
const sessionChoices: MapChoices = {};

function readChoices(): MapChoices {
  try {
    const raw = localStorage.getItem(MAP_CHOICE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * The map to show for `theatre`: the stored choice if the theatre still offers
 * it, otherwise the theatre's default map. A stale choice is kept in storage,
 * so it applies again if the map comes back.
 */
export function resolveMapChoice(theatre: TheatreMetadata): string {
  const stored = sessionChoices[theatre.id] ?? readChoices()[theatre.id];
  if (stored && theatre.maps.some(m => m.id === stored)) {
    return stored;
  }
  return theatre.defaultMap;
}

export function setMapChoice(theatreId: string, mapId: string): void {
  sessionChoices[theatreId] = mapId;
  try {
    localStorage.setItem(MAP_CHOICE_KEY, JSON.stringify({ ...readChoices(), [theatreId]: mapId }));
  } catch {
    // Storage unavailable: the choice will not persist, but the views still follow it.
  }
  listeners.forEach(listener => listener());
}

/** Notifies `listener` whenever a choice is set in this tab. */
export function subscribeMapChoice(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
