import { useCallback } from 'react';
import { trackEvent } from '../utils/plausible';

/**
 * React hook for Plausible Analytics event tracking
 * 
 * @example
 * const { trackEvent } = usePlausible();
 * trackEvent('ButtonClick', { button: 'generate' });
 */
export const usePlausible = () => {
  const track = useCallback(
    (
      eventName: string,
      options?: {
        props?: Record<string, string>;
        revenue?: { amount: number; currency: string };
        interactive?: boolean;
      }
    ) => {
      trackEvent(eventName, options);
    },
    []
  );

  return { trackEvent: track };
};

