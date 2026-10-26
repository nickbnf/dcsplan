import { useState, useEffect } from 'react';
import { getApiUrl } from '../config/api';

export interface MapMetadata {
  id: string;
  name: string;
}

export interface TheatreMetadata {
  id: string;
  name: string;
  defaultMap: string;
  maps: MapMetadata[];
}

type CatalogueEntry = { id: string; name: string; default_map: string; maps: MapMetadata[] };

// The catalogue is static config: fetch it once per page load and share it
// between every component that needs it.
let cataloguePromise: Promise<TheatreMetadata[]> | null = null;

export const fetchTheatreCatalogue = (): Promise<TheatreMetadata[]> => {
  if (!cataloguePromise) {
    cataloguePromise = fetch(getApiUrl('theatres'))
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch theatre list: ${response.status}`);
        }
        const { theatres } = await response.json() as { theatres: CatalogueEntry[] };
        return theatres.map(t => ({ id: t.id, name: t.name || t.id, defaultMap: t.default_map, maps: t.maps }));
      })
      .catch((err) => {
        cataloguePromise = null; // allow a retry on the next mount
        throw err;
      });
  }
  return cataloguePromise;
};

export const useTheatres = () => {
  const [theatres, setTheatres] = useState<TheatreMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTheatreCatalogue()
      .then((result) => { if (!cancelled) setTheatres(result); })
      .catch((err) => {
        console.error("Failed to load theatres:", err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { theatres, isLoading, error };
};
