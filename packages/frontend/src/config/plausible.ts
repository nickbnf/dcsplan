/**
 * Plausible Analytics configuration
 * 
 * Set these environment variables to enable Plausible:
 * - VITE_PLAUSIBLE_DOMAIN: Your domain (e.g., "dcsplan.example.com")
 * - VITE_PLAUSIBLE_ENDPOINT: Your Plausible CE API endpoint (e.g., "https://analytics.example.com/api/event")
 */

export const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN;
export const PLAUSIBLE_ENDPOINT = import.meta.env.VITE_PLAUSIBLE_ENDPOINT;

export const isPlausibleEnabled = (): boolean => {
  return !!PLAUSIBLE_DOMAIN;
};

