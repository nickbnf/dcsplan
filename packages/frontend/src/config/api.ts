/**
 * API configuration
 * Uses Vite environment variables for configuration
 */
// Single origin (D6): the backend is served under the same host at /api, routed
// to the backend by Caddy in prod (prefix stripped) and by the Vite dev proxy in
// development. A relative base means every request is same-origin (no CORS, and
// the session cookie is sent automatically).
export const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Get the full API URL for a given endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_URL}/${cleanEndpoint}`;
};

/**
 * Get the tiles base URL of one map of a theatre
 */
export const getTilesBaseUrl = (theatre: string, mapId: string): string => {
  return `${API_URL}/tiles/${theatre}/${mapId}/{z}/{x}/{y}.png`;
};

/**
 * Get the URL of a theatre's config (name, default map, navigation settings)
 */
export const getTheatreInfoUrl = (theatre: string): string => getApiUrl(`theatres/${theatre}/theatre.json`);

/**
 * Get the URL of a map's config (display projection, tile grid, bounds)
 */
export const getMapInfoUrl = (theatre: string, mapId: string): string =>
  getApiUrl(`theatres/${theatre}/maps/${mapId}.json`);

