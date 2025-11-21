/**
 * DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
 * 
 * This file contains production debug logging for Plausible Analytics.
 * To remove all debug code:
 * 1. Search for "DEBUG: PRODUCTION" and "END DEBUG" comments
 * 2. Remove all code blocks between these markers
 * 3. Also remove the debug function in main.tsx
 * 
 * All debug logs are prefixed with "[Plausible DEBUG]" for easy filtering.
 */

import { init, track } from '@plausible-analytics/tracker';
import { PLAUSIBLE_DOMAIN, PLAUSIBLE_ENDPOINT, isPlausibleEnabled } from '../config/plausible';

/**
 * Initialize Plausible Analytics
 * Only initializes if VITE_PLAUSIBLE_DOMAIN is set
 */
export const initPlausible = (): void => {
  // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
  console.log('[Plausible DEBUG] Initialization started', {
    isEnabled: isPlausibleEnabled(),
    domain: PLAUSIBLE_DOMAIN || 'NOT SET',
    endpoint: PLAUSIBLE_ENDPOINT || 'NOT SET (using default)',
    env: import.meta.env.MODE,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
    currentUrl: typeof window !== 'undefined' ? window.location.href : 'N/A',
  });
  // END DEBUG

  if (!isPlausibleEnabled()) {
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.warn('[Plausible DEBUG] Disabled - VITE_PLAUSIBLE_DOMAIN not set');
    // END DEBUG
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

  // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
  console.log('[Plausible DEBUG] Configuration:', {
    domain: config.domain,
    endpoint: config.endpoint || 'default (plausible.io)',
    captureOnLocalhost: config.captureOnLocalhost,
    autoCapturePageviews: config.autoCapturePageviews,
  });
  // END DEBUG

  if (import.meta.env.DEV) {
    console.log('[Plausible] Initializing with config:', {
      domain: config.domain,
      endpoint: config.endpoint || 'default (plausible.io)',
      captureOnLocalhost: config.captureOnLocalhost,
    });
  }

  try {
    init(config);

    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    // Check if Plausible was actually initialized after a short delay
    setTimeout(() => {
      const plausibleAvailable = typeof (window as any).plausible !== 'undefined';
      console.log('[Plausible DEBUG] Post-init check:', {
        plausibleAvailable,
        windowPlausible: typeof (window as any).plausible,
        timestamp: new Date().toISOString(),
      });
      if (!plausibleAvailable) {
        console.error('[Plausible DEBUG] ERROR: window.plausible is not available after initialization!');
      }
    }, 1000);
    // END DEBUG

    if (import.meta.env.DEV) {
      console.log('[Plausible] Initialized successfully');
    }
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.log('[Plausible DEBUG] init() called successfully');
    // END DEBUG
  } catch (error) {
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.error('[Plausible DEBUG] ERROR during initialization:', error);
    // END DEBUG
    throw error;
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
  // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
  console.log('[Plausible DEBUG] trackEvent called:', {
    eventName,
    options,
    isEnabled: isPlausibleEnabled(),
    plausibleAvailable: typeof (window as any).plausible !== 'undefined',
    timestamp: new Date().toISOString(),
  });
  // END DEBUG

  if (!isPlausibleEnabled()) {
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.warn('[Plausible DEBUG] Event ignored (disabled):', eventName);
    // END DEBUG
    if (import.meta.env.DEV) {
      console.log('[Plausible] Event ignored (disabled):', eventName);
    }
    return;
  }

  // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
  if (typeof (window as any).plausible === 'undefined') {
    console.error('[Plausible DEBUG] ERROR: window.plausible is not available when tracking event:', eventName);
    console.error('[Plausible DEBUG] This usually means Plausible failed to initialize');
  }
  // END DEBUG

  if (import.meta.env.DEV) {
    console.log('[Plausible] Tracking event:', eventName, options);
  }

  try {
    track(eventName, options || {});
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.log('[Plausible DEBUG] track() called successfully for event:', eventName);
    // END DEBUG
  } catch (error) {
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.error('[Plausible DEBUG] ERROR during track():', error, {
      eventName,
      options,
    });
    // END DEBUG
    throw error;
  }
};

