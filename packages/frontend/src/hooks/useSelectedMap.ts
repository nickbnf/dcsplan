import { useSyncExternalStore } from 'react';
import { useTheatres, type TheatreMetadata } from './useTheatres';
import { resolveMapChoice, subscribeMapChoice } from '../utils/mapChoice';

/**
 * The theatre's metadata and the map to display for it on this device
 * (add-theatre-maps D5), or a null map id while the catalogue loads. Every map
 * view of the theatre follows a new choice as soon as it is made.
 */
export const useSelectedMap = (theatreId: string): { theatre: TheatreMetadata | undefined; mapId: string | null } => {
  const { theatres } = useTheatres();
  const theatre = theatres.find(t => t.id === theatreId);
  const mapId = useSyncExternalStore(
    subscribeMapChoice,
    () => (theatre ? resolveMapChoice(theatre) : null),
  );
  return { theatre, mapId };
};
