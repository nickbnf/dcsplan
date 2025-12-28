/**
 * API configuration
 * Uses Vite environment variables for configuration
 */
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Get the full API URL for a given endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${API_URL}/${cleanEndpoint}`;
};

/**
 * Get the tiles base URL
 */
export const getTilesBaseUrl = (theatre: string): string => {
  return `${API_URL}/tiles/${theatre}/{z}/{x}/{y}.png`;
};

