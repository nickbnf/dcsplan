import { useState, useEffect, useRef } from 'react';
import type { FlightPlan, VersionedFlightPlan } from '../types/flightPlan';
import { FLIGHT_PLAN_VERSION } from '../types/flightPlan';

const STORAGE_KEY = 'dcsplan-flightplan';
const DEBOUNCE_MS = 300;

/**
 * Validates that the parsed data matches the FlightPlan structure
 */
function isValidFlightPlan(data: any): data is FlightPlan {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.theatre === 'string' &&
    Array.isArray(data.points) &&
    typeof data.declination === 'number' &&
    typeof data.bankAngle === 'number' &&
    typeof data.initTimeSec === 'number' &&
    typeof data.initFob === 'number' &&
    typeof data.name === 'string' &&
    data.points.every((point: any) =>
      point &&
      typeof point.lat === 'number' &&
      typeof point.lon === 'number' &&
      typeof point.tas === 'number' &&
      typeof point.alt === 'number' &&
      typeof point.fuelFlow === 'number' &&
      typeof point.windSpeed === 'number' &&
      typeof point.windDir === 'number'
    )
  );
}

/**
 * Loads flight plan from localStorage and migrates if necessary
 */
function loadFlightPlan(): FlightPlan | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return null;
    }

    const parsed = JSON.parse(saved);
    
    // Check if we have a versioned wrapper
    let flightPlanData: any;
    let version: string | undefined;

    if (parsed && typeof parsed === 'object' && parsed.version && parsed.flightPlan) {
      flightPlanData = parsed.flightPlan;
      version = parsed.version;
    } else {
      // Legacy unversioned data
      flightPlanData = parsed;
      version = undefined;
    }

    // Migration logic
    if (version !== FLIGHT_PLAN_VERSION) {
      console.info(`Migrating flight plan from version ${version || 'legacy'} to ${FLIGHT_PLAN_VERSION}`);
      
      // Ensure theatre exists (required in 1.1)
      if (flightPlanData && typeof flightPlanData === 'object' && !flightPlanData.theatre) {
        flightPlanData.theatre = "syria_old";
      }
      
      // Additional migration steps for future versions would go here
    }

    if (isValidFlightPlan(flightPlanData)) {
      return flightPlanData;
    }

    // Invalid data structure - clear it
    console.warn('Invalid flight plan data in storage, clearing');
    localStorage.removeItem(STORAGE_KEY);
    return null;
  } catch (error) {
    // JSON parse error or other issues
    console.warn('Failed to load flight plan from storage:', error);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore errors when clearing
    }
    return null;
  }
}

/**
 * Saves flight plan to localStorage
 */
function saveFlightPlan(flightPlan: FlightPlan): void {
  try {
    const versionedData: VersionedFlightPlan = {
      version: FLIGHT_PLAN_VERSION,
      flightPlan: flightPlan
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(versionedData));
  } catch (error) {
    if (error instanceof DOMException) {
      if (error.name === 'QuotaExceededError') {
        console.warn('Storage quota exceeded, flight plan not persisted');
      } else if (error.name === 'SecurityError') {
        console.warn('Storage not available (private browsing?), flight plan not persisted');
      } else {
        console.warn('Failed to save flight plan to storage:', error);
      }
    } else {
      console.warn('Failed to save flight plan to storage:', error);
    }
    // Continue execution - persistence failure shouldn't break the app
  }
}

/**
 * Custom hook that persists flight plan state to localStorage
 * 
 * @param defaultPlan - Function that returns the default flight plan (used when no saved data exists)
 * @returns Tuple of [flightPlan, setFlightPlan] matching useState API
 */
export function usePersistedFlightPlan(
  defaultPlan: () => FlightPlan
): [FlightPlan, React.Dispatch<React.SetStateAction<FlightPlan>>] {
  // Initialize state with data from localStorage, or use default
  const [flightPlan, setFlightPlan] = useState<FlightPlan>(() => {
    const saved = loadFlightPlan();
    return saved ?? defaultPlan();
  });

  // Track if this is the initial mount to avoid saving on first render
  const isInitialMount = useRef(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save to localStorage when flight plan changes
  useEffect(() => {
    // Skip saving on initial mount (we just loaded the data)
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Clear any pending save
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce the save operation
    debounceTimerRef.current = setTimeout(() => {
      saveFlightPlan(flightPlan);
    }, DEBOUNCE_MS);

    // Cleanup: clear timeout on unmount or when flightPlan changes before timeout
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [flightPlan]);

  return [flightPlan, setFlightPlan];
}

