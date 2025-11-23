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

  try {
    init(config);
    
    // Test if package is working by checking if a test event callback fires
    let testCallbackFired = false;
    try {
      track('__test_init__', { 
        callback: () => {
          testCallbackFired = true;
        }
      });
      
      // Check if callback fired (it should fire immediately if event is ignored, or later if sent)
      setTimeout(() => {
        if (!testCallbackFired) {
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
      console.error('[Plausible] Package initialization failed:', error);
    }
  } catch (error) {
    console.error('[Plausible] Error during initialization:', error);
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
    return;
  }

  // Try the package's track function first
  let packageWorked = false;
  const trackOptions = {
    ...(options || {}),
    callback: () => {
      packageWorked = true;
    },
  };

  try {
    track(eventName, trackOptions);
  } catch (error) {
    console.error('[Plausible] Package track() failed:', error);
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
      }).catch((error) => {
        console.error('[Plausible] Manual send error:', error);
      });
    }
  }, 100); // Short delay to check if package callback fired
};

