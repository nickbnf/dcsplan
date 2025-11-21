import { init, track } from '@plausible-analytics/tracker';
import { PLAUSIBLE_DOMAIN, PLAUSIBLE_ENDPOINT, isPlausibleEnabled } from '../config/plausible';

/**
 * Initialize Plausible Analytics
 * Only initializes if VITE_PLAUSIBLE_DOMAIN is set
 */
export const initPlausible = (): void => {
  if (!isPlausibleEnabled()) {
    if (import.meta.env.DEV) {
      console.log('[Plausible] Disabled - VITE_PLAUSIBLE_DOMAIN not set');
    }
    return;
  }

  const config: Parameters<typeof init>[0] = {
    domain: PLAUSIBLE_DOMAIN!,
    autoCapturePageviews: true,
    // Enable localhost tracking in development
    captureOnLocalhost: import.meta.env.DEV,
  };

  // If using self-hosted Plausible CE, set the endpoint
  if (PLAUSIBLE_ENDPOINT) {
    config.endpoint = PLAUSIBLE_ENDPOINT;
  }

  if (import.meta.env.DEV) {
    console.log('[Plausible] Initializing with config:', {
      domain: config.domain,
      endpoint: config.endpoint || 'default (plausible.io)',
      captureOnLocalhost: config.captureOnLocalhost,
    });
  }

  init(config);

  if (import.meta.env.DEV) {
    console.log('[Plausible] Initialized successfully');
  }
};

/**
 * Track a custom event
 * 
 * @example
 * trackEvent('GenerateKneeboard', { props: { method: 'zip' } });
 */
export const trackEvent = (
  eventName: string,
  options?: {
    props?: Record<string, string>;
    revenue?: { amount: number; currency: string };
    interactive?: boolean;
  }
): void => {
  if (!isPlausibleEnabled()) {
    if (import.meta.env.DEV) {
      console.log('[Plausible] Event ignored (disabled):', eventName);
    }
    return;
  }

  if (import.meta.env.DEV) {
    console.log('[Plausible] Tracking event:', eventName, options);
  }

  track(eventName, options || {});
};

