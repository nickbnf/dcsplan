import { useState, useEffect } from 'react';
import { getApiUrl } from '../config/api';

export interface TheatreMetadata {
  id: string;
  name: string;
}

export const useTheatres = () => {
  const [theatres, setTheatres] = useState<TheatreMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTheatres = async () => {
      try {
        setIsLoading(true);
        // 1. Get the list of IDs
        const listResponse = await fetch(getApiUrl('theatres'));
        if (!listResponse.ok) {
          throw new Error(`Failed to fetch theatre list: ${listResponse.status}`);
        }
        const { theatres: ids } = await listResponse.json();

        // 2. Fetch metadata for each ID to get the full name
        const metadataPromises = ids.map(async (id: string) => {
          try {
            const res = await fetch(getApiUrl(`theatres/${id}.json`));
            if (!res.ok) {
              console.warn(`Failed to fetch metadata for ${id}: ${res.status}`);
              return { id, name: id };
            }
            const data = await res.json();
            return {
              id,
              name: data.theatre_name || id
            };
          } catch (e) {
            console.warn(`Error fetching metadata for ${id}:`, e);
            return { id, name: id };
          }
        });

        const results = await Promise.all(metadataPromises);
        setTheatres(results);
      } catch (err) {
        console.error("Failed to load theatres:", err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchTheatres();
  }, []);

  return { theatres, isLoading, error };
};

