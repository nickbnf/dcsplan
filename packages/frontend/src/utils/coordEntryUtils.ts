import type { CoordEntryState } from '../contexts/WaypointSelectionContext';

export function initCoordEntry(trigger: string): CoordEntryState {
  const state: CoordEntryState = {
    latHem: 'N',
    latDeg: '',
    latMin: '',
    lonHem: 'E',
    lonDeg: '',
    lonMin: '',
    cursor: 'latDeg',
    hasError: false,
  };
  return applyKey(state, trigger);
}

/** Pure function: returns next state given a keypress. */
export function applyKey(state: CoordEntryState, key: string): CoordEntryState {
  const s = { ...state, hasError: false };

  if (s.cursor === 'latDeg') {
    if (key === 'N') return { ...s, latHem: 'N' };
    if (key === 'S') return { ...s, latHem: 'S' };
    if (key === 'Backspace') {
      if (s.latDeg.length > 0) return { ...s, latDeg: s.latDeg.slice(0, -1) };
      return s;
    }
    // Space/Tab within degrees: advance to minutes slot for same axis
    if (key === ' ' || key === 'Tab') {
      if (s.latDeg.length > 0) return { ...s, cursor: 'latMin' };
      return { ...s, hasError: true };
    }
    if (key === 'Enter' || key === 'E' || key === 'W') {
      if (canAdvanceToLon(s)) {
        const lonHem = key === 'W' ? 'W' : key === 'E' ? 'E' : s.lonHem;
        return { ...s, cursor: 'lonDeg', lonHem };
      }
      if (s.latDeg.length > 0) return { ...s, cursor: 'latMin' };
      return { ...s, hasError: true };
    }
    if (/^\d$/.test(key)) {
      if (s.latDeg.length < 2) {
        const newDeg = s.latDeg + key;
        return { ...s, latDeg: newDeg, cursor: newDeg.length === 2 ? 'latMin' : 'latDeg' };
      }
      return s;
    }
    return s;
  }

  if (s.cursor === 'latMin') {
    if (key === 'N') return { ...s, latHem: 'N' };
    if (key === 'S') return { ...s, latHem: 'S' };
    if (key === 'Backspace') {
      if (s.latMin.length > 0) return { ...s, latMin: s.latMin.slice(0, -1) };
      return { ...s, cursor: 'latDeg' };
    }
    if (key === ' ' || key === 'Tab' || key === 'Enter') {
      if (canAdvanceToLon(s)) return { ...s, cursor: 'lonDeg' };
      return { ...s, hasError: true };
    }
    if (key === 'E') {
      if (canAdvanceToLon(s)) return { ...s, cursor: 'lonDeg', lonHem: 'E' };
      return { ...s, hasError: true };
    }
    if (key === 'W') {
      if (canAdvanceToLon(s)) return { ...s, cursor: 'lonDeg', lonHem: 'W' };
      return { ...s, hasError: true };
    }
    if (/^\d$/.test(key)) {
      if (s.latMin.length < 4) return { ...s, latMin: s.latMin + key };
      return s;
    }
    return s;
  }

  if (s.cursor === 'lonDeg') {
    if (key === 'E') return { ...s, lonHem: 'E' };
    if (key === 'W') return { ...s, lonHem: 'W' };
    if (key === 'Backspace') {
      if (s.lonDeg.length > 0) return { ...s, lonDeg: s.lonDeg.slice(0, -1) };
      return { ...s, cursor: 'latMin' };
    }
    // Space/Tab within longitude degrees: advance to longitude minutes slot
    if (key === ' ' || key === 'Tab') {
      if (s.lonDeg.length > 0) return { ...s, cursor: 'lonMin' };
      return { ...s, hasError: true };
    }
    if (key === 'Enter') {
      if (!isMinimumValid(s)) return { ...s, hasError: true };
      return s; // caller (Map.tsx) handles commit
    }
    if (/^\d$/.test(key)) {
      if (s.lonDeg.length < 3) {
        const newDeg = s.lonDeg + key;
        return { ...s, lonDeg: newDeg, cursor: newDeg.length === 3 ? 'lonMin' : 'lonDeg' };
      }
      return s;
    }
    return s;
  }

  // cursor === 'lonMin'
  if (key === 'E') return { ...s, lonHem: 'E' };
  if (key === 'W') return { ...s, lonHem: 'W' };
  if (key === 'Backspace') {
    if (s.lonMin.length > 0) return { ...s, lonMin: s.lonMin.slice(0, -1) };
    return { ...s, cursor: 'lonDeg' };
  }
  if (key === 'Enter') {
    if (!isMinimumValid(s)) return { ...s, hasError: true };
    return s; // caller handles commit
  }
  if (/^\d$/.test(key)) {
    if (s.lonMin.length < 4) return { ...s, lonMin: s.lonMin + key };
    return s;
  }
  return s;
}

function canAdvanceToLon(s: CoordEntryState): boolean {
  return s.latDeg.length > 0 && s.latMin.length > 0;
}

function isMinimumValid(s: CoordEntryState): boolean {
  return s.latDeg.length > 0 && s.latMin.length > 0
      && s.lonDeg.length > 0 && s.lonMin.length > 0;
}

function buildDegreePart(digits: string, maxLen: number, active: boolean): string {
  let result = '';
  for (let i = 0; i < maxLen; i++) {
    if (active && i === digits.length) result += '§';
    result += digits[i] ?? '–';
  }
  return result;
}

function buildMinutePart(digits: string, active: boolean): string {
  const ins = (pos: number) => (active && digits.length === pos ? '§' : '');
  const d = (i: number) => digits[i] ?? '–';
  return `${ins(0)}${d(0)}${ins(1)}${d(1)}.${ins(2)}${d(2)}${ins(3)}${d(3)}`;
}

/**
 * Format template for display. Unfilled slots shown as –.
 * Inserts a § marker at the cursor position; the overlay component renders it as a blinking cursor.
 */
export function formatTemplate(state: CoordEntryState): string {
  const { latHem, latDeg, latMin, lonHem, lonDeg, lonMin, cursor } = state;
  const ld = buildDegreePart(latDeg, 2, cursor === 'latDeg');
  const lm = buildMinutePart(latMin, cursor === 'latMin');
  const nd = buildDegreePart(lonDeg, 3, cursor === 'lonDeg');
  const nm = buildMinutePart(lonMin, cursor === 'lonMin');
  return `${latHem}${ld}°${lm}' ${lonHem}${nd}°${nm}'`;
}

/**
 * Parse filled template state into decimal degrees.
 * Returns null if minimum data is not met.
 * Minimum: degrees + at least one minute digit per axis.
 */
export function parseCoordEntry(state: CoordEntryState): { lat: number; lon: number } | null {
  if (!isMinimumValid(state)) return null;

  const latDeg = parseInt(state.latDeg, 10);
  const lonDeg = parseInt(state.lonDeg, 10);

  const latMinRaw = state.latMin.padEnd(4, '0');
  const lonMinRaw = state.lonMin.padEnd(4, '0');

  const latMin = parseFloat(`${latMinRaw.slice(0, 2)}.${latMinRaw.slice(2)}`);
  const lonMin = parseFloat(`${lonMinRaw.slice(0, 2)}.${lonMinRaw.slice(2)}`);

  if (latDeg > 90 || latMin >= 60 || lonDeg > 180 || lonMin >= 60) return null;

  const lat = (latDeg + latMin / 60) * (state.latHem === 'S' ? -1 : 1);
  const lon = (lonDeg + lonMin / 60) * (state.lonHem === 'W' ? -1 : 1);

  return { lat, lon };
}
