import { useState, useEffect } from 'react';
import { getTheatreInfoUrl } from '../config/api';
import { createMapProjection } from '../utils/projectionUtils';

/**
 * A theatre's navigation settings: the projection and mode used for leg
 * headings, distances and turns. They belong to the theatre, never to the
 * displayed map, so switching map cannot change any computed value.
 */
export interface NavigationConfig {
  mode: string;
  projection: string;
  central_meridian: number;
  std_parallel1?: number;
  std_parallel2?: number;
}

export interface TheatreNavigation {
  projection: any;
  navigationMode: string;
}

export const createNavigation = (config: NavigationConfig): TheatreNavigation => {
  const { projection } = createMapProjection(
    config.projection,
    config.central_meridian,
    config.std_parallel1 ?? 0,
    config.std_parallel2 ?? 0,
  );
  return { projection, navigationMode: config.mode || 'geographic' };
};

// Theatre configs are static: fetch each once per page load.
const configPromises = new Map<string, Promise<NavigationConfig>>();

const fetchNavigationConfig = (theatre: string): Promise<NavigationConfig> => {
  let promise = configPromises.get(theatre);
  if (!promise) {
    promise = fetch(getTheatreInfoUrl(theatre), { signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch theatre ${theatre}: ${response.status}`);
        }
        const data = await response.json();
        return data.navigation as NavigationConfig;
      })
      .catch((err) => {
        configPromises.delete(theatre); // allow a retry
        throw err;
      });
    configPromises.set(theatre, promise);
  }
  return promise;
};

/**
 * The navigation settings of `theatre`, or null while they load.
 */
export const useTheatreNavigation = (theatre: string): TheatreNavigation | null => {
  const [navigation, setNavigation] = useState<{ theatre: string; value: TheatreNavigation } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNavigationConfig(theatre)
      .then((config) => { if (!cancelled) setNavigation({ theatre, value: createNavigation(config) }); })
      .catch((err) => console.error('Failed to load theatre navigation settings:', err));
    return () => { cancelled = true; };
  }, [theatre]);

  // Never hand out the previous theatre's settings while the new ones load.
  return navigation && navigation.theatre === theatre ? navigation.value : null;
};
