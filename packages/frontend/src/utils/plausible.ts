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
 * Manually send a pageview event to Plausible
 * Used as fallback when the package isn't working
 */
const sendPageviewManually = (url?: string): void => {
  if (!isPlausibleEnabled()) {
    return;
  }

  const endpoint = PLAUSIBLE_ENDPOINT || 'https://plausible.io/api/event';
  const eventData = {
    n: 'pageview',
    u: url || window.location.href,
    d: PLAUSIBLE_DOMAIN!,
    r: document.referrer || null,
  };

  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    keepalive: true,
    body: JSON.stringify(eventData),
  }).catch(() => {
    // Silently fail - don't log errors in production
  });
};

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
    captureOnLocalhost: import.meta.env.DEV,
    bindToWindow: true,
    logging: true,
  };

  // If using self-hosted Plausible CE, set the endpoint
  // The endpoint should be the full URL including /api/event
  if (PLAUSIBLE_ENDPOINT) {
    // Ensure endpoint ends with /api/event (package expects full endpoint URL)
    const endpoint = PLAUSIBLE_ENDPOINT.endsWith('/api/event') 
      ? PLAUSIBLE_ENDPOINT 
      : `${PLAUSIBLE_ENDPOINT.replace(/\/$/, '')}/api/event`;
    config.endpoint = endpoint;
  }

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
    // Log what we passed to init() vs what the package might have received
    console.log('[Plausible DEBUG] init() called with config:', {
      domain: config.domain,
      endpoint: config.endpoint || 'default',
      captureOnLocalhost: config.captureOnLocalhost,
      autoCapturePageviews: config.autoCapturePageviews,
      bindToWindow: config.bindToWindow,
      logging: config.logging,
    });
    
    // Test if package is actually initialized by trying to call track()
    // The package will throw if not initialized
    try {
      let testCallbackFired = false;
      track('__test_init__', { 
        callback: (result) => {
          testCallbackFired = true;
          console.log('[Plausible DEBUG] 🔔 Test event callback FIRED!', {
            hasResult: !!result,
            result: result,
          });
          if (result) {
            console.log('[Plausible DEBUG] ✅ Test event was sent successfully');
          } else {
            console.warn('[Plausible DEBUG] ⚠️ Test event was ignored by package (callback called with no result)');
          }
        }
      });
      console.log('[Plausible DEBUG] ✅ Package initialization verified - track() call succeeded');
      
      // Check if callback fired (it should fire immediately if event is ignored, or later if sent)
      setTimeout(() => {
        if (!testCallbackFired) {
          console.error('[Plausible DEBUG] ❌ CRITICAL: Test event callback did NOT fire!');
          console.error('[Plausible DEBUG] This means the package is silently dropping events without calling callbacks');
          console.error('[Plausible DEBUG] Using manual fallback for pageviews');
          
          // Package isn't working - set up manual pageview tracking
          if (typeof window !== 'undefined' && window.history) {
            // Track initial pageview
            sendPageviewManually();
            
            // Track pageviews on navigation (for SPAs)
            const originalPushState = window.history.pushState;
            const originalReplaceState = window.history.replaceState;
            
            window.history.pushState = function(...args) {
              originalPushState.apply(this, args);
              setTimeout(() => sendPageviewManually(), 0);
            };
            
            window.history.replaceState = function(...args) {
              originalReplaceState.apply(this, args);
              setTimeout(() => sendPageviewManually(), 0);
            };
            
            window.addEventListener('popstate', () => {
              setTimeout(() => sendPageviewManually(), 0);
            });
          }
        }
      }, 1000);
    } catch (error) {
      console.error('[Plausible DEBUG] ❌ Package initialization FAILED:', error);
    }
    // END DEBUG

    if (import.meta.env.DEV) {
      console.log('[Plausible] Initialized successfully');
    }
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
  if (!isPlausibleEnabled()) {
    if (import.meta.env.DEV) {
      console.log('[Plausible] Event ignored (disabled):', eventName);
    }
    return;
  }

  if (import.meta.env.DEV) {
    console.log('[Plausible] Tracking event:', eventName, options);
  }

  // Try the package's track function first
  let packageWorked = false;
  const trackOptions = {
    ...(options || {}),
    callback: (result?: { status: number } | { error: unknown } | undefined) => {
      packageWorked = true;
      if (result && 'status' in result) {
        if (import.meta.env.DEV) {
          console.log('[Plausible] Event tracked via package:', eventName);
        }
      }
    },
  };

  try {
    track(eventName, trackOptions);
  } catch (error) {
    // Package failed, will use fallback
    if (import.meta.env.DEV) {
      console.warn('[Plausible] Package track() failed:', error);
    }
  }

  // Fallback: If package didn't work, send manually after a short delay
  setTimeout(() => {
    if (!packageWorked) {
      // Manual fallback: Send event directly to Plausible
      const endpoint = PLAUSIBLE_ENDPOINT || 'https://plausible.io/api/event';
      const eventData = {
        n: eventName, // event name
        u: window.location.href, // URL
        d: PLAUSIBLE_DOMAIN!, // domain
        r: document.referrer || null, // referrer
        ...(options?.props && { p: options.props }), // props
        ...(options?.revenue && { $: options.revenue }), // revenue
        ...(options?.interactive === false && { i: false }), // interactive flag
      };

      fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
        },
        keepalive: true,
        body: JSON.stringify(eventData),
      })
        .then((response) => {
          if (import.meta.env.DEV) {
            if (response.ok || response.status === 202) {
              console.log('[Plausible] Event sent manually:', eventName);
            } else {
              console.warn('[Plausible] Manual send failed:', response.status);
            }
          }
        })
        .catch((error) => {
          if (import.meta.env.DEV) {
            console.error('[Plausible] Manual send error:', error);
          }
        });
    }
  }, 100); // Short delay to check if package callback fired
};

