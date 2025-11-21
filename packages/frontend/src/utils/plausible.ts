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
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    // Explicitly bind to window (might be needed for custom endpoints)
    bindToWindow: true,
    // END DEBUG
  };

  // If using self-hosted Plausible CE, set the endpoint
  if (PLAUSIBLE_ENDPOINT) {
    config.endpoint = PLAUSIBLE_ENDPOINT;
    
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    // Test endpoint connectivity
    fetch(PLAUSIBLE_ENDPOINT, {
      method: 'OPTIONS', // Preflight check
      mode: 'cors',
    })
      .then((response) => {
        console.log('[Plausible DEBUG] Endpoint connectivity test:', {
          endpoint: PLAUSIBLE_ENDPOINT,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        });
      })
      .catch((error) => {
        console.error('[Plausible DEBUG] Endpoint connectivity test FAILED:', {
          endpoint: PLAUSIBLE_ENDPOINT,
          error: error.message,
          stack: error.stack,
        });
      });
    // END DEBUG
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
  // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
  console.log('[Plausible DEBUG] About to call init() with config:', JSON.stringify(config, null, 2));
  console.log('[Plausible DEBUG] window.plausible before init:', typeof (window as any).plausible);
  console.log('[Plausible DEBUG] init function type:', typeof init);
  console.log('[Plausible DEBUG] Package info check - checking for @plausible-analytics/tracker in window:', {
    hasTracker: typeof (window as any).plausibleTracker !== 'undefined',
    windowKeys: typeof window !== 'undefined' ? Object.keys(window).filter(k => k.toLowerCase().includes('plausible')) : [],
  });
  // END DEBUG

  const initResult = init(config);
  
  // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
  console.log('[Plausible DEBUG] init() return value:', initResult);
  // END DEBUG

    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.log('[Plausible DEBUG] init() returned, checking window.plausible immediately:', typeof (window as any).plausible);
    
    // Check multiple times with increasing delays
    [100, 500, 1000, 2000, 3000].forEach((delay) => {
      setTimeout(() => {
        const plausibleAvailable = typeof (window as any).plausible !== 'undefined';
        const plausibleValue = (window as any).plausible;
        console.log(`[Plausible DEBUG] Post-init check (${delay}ms):`, {
          plausibleAvailable,
          windowPlausible: typeof plausibleValue,
          plausibleValue: plausibleValue,
          timestamp: new Date().toISOString(),
        });
        
        // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
        // Note: @plausible-analytics/tracker doesn't create window.plausible by default
        // The bindToWindow option should create it, but it's not required for the package to work
        if (!plausibleAvailable && delay >= 2000) {
          console.warn('[Plausible DEBUG] Note: window.plausible is not available');
          console.warn('[Plausible DEBUG] This is normal if bindToWindow is false or not supported');
          console.warn('[Plausible DEBUG] The package will still work using track() function directly');
          console.warn('[Plausible DEBUG] To verify it works:');
          console.warn('  1. Check Network tab for POST requests to your endpoint');
          console.warn('  2. Look for requests when navigating (pageviews) or calling trackEvent()');
          console.warn('  3. Requests should have status 202 (Accepted)');
          
          // Try to manually check if we can reach the endpoint
          if (PLAUSIBLE_ENDPOINT) {
            console.log('[Plausible DEBUG] Testing endpoint connectivity...');
            fetch(PLAUSIBLE_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                n: 'pageview',
                u: window.location.href,
                d: PLAUSIBLE_DOMAIN,
              }),
            })
              .then((r) => {
                console.log('[Plausible DEBUG] Manual endpoint test response:', {
                  status: r.status,
                  statusText: r.statusText,
                  ok: r.ok,
                  headers: Object.fromEntries(r.headers.entries()),
                });
                if (r.ok || r.status === 202) {
                  console.log('[Plausible DEBUG] ✅ Endpoint is reachable and accepting requests!');
                } else {
                  console.warn('[Plausible DEBUG] ⚠️ Endpoint responded but with unexpected status');
                }
              })
              .catch((e) => {
                console.error('[Plausible DEBUG] ❌ Manual endpoint test error:', e);
                console.error('[Plausible DEBUG] This suggests CORS or network issues');
              });
          }
        }
        // END DEBUG
      }, delay);
    });
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
  // Note: @plausible-analytics/tracker doesn't create window.plausible by default
  // It uses the track() function directly, so this check is informational only
  const hasWindowPlausible = typeof (window as any).plausible !== 'undefined';
  if (!hasWindowPlausible) {
    console.log('[Plausible DEBUG] Note: window.plausible is not available (this is normal for @plausible-analytics/tracker package)');
    console.log('[Plausible DEBUG] The package uses track() function directly, not window.plausible');
  }
  // END DEBUG

  if (import.meta.env.DEV) {
    console.log('[Plausible] Tracking event:', eventName, options);
  }

  try {
    track(eventName, options || {});
    
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.log('[Plausible DEBUG] track() called successfully for event:', eventName);
    console.log('[Plausible DEBUG] Check Network tab for POST request to endpoint');
    // END DEBUG
  } catch (error) {
    // DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
    console.error('[Plausible DEBUG] ERROR during track():', error, {
      eventName,
      options,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    // END DEBUG
    throw error;
  }
};

