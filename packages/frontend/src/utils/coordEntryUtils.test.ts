import { describe, it, expect } from 'vitest';
import { initCoordEntry, applyKey, parseCoordEntry, formatTemplate } from './coordEntryUtils';
import type { CoordEntryState } from '../contexts/WaypointSelectionContext';

const base: CoordEntryState = {
  latHem: 'N', latDeg: '', latMin: '',
  lonHem: 'E', lonDeg: '', lonMin: '',
  cursor: 'latDeg', hasError: false,
};

describe('initCoordEntry', () => {
  it('digit trigger fills first latDeg slot, defaults N/E', () => {
    const s = initCoordEntry('4');
    expect(s.latHem).toBe('N');
    expect(s.lonHem).toBe('E');
    expect(s.latDeg).toBe('4');
    expect(s.cursor).toBe('latDeg');
  });

  it('N trigger sets latHem N', () => {
    const s = initCoordEntry('N');
    expect(s.latHem).toBe('N');
    expect(s.latDeg).toBe('');
  });

  it('S trigger sets latHem S', () => {
    const s = initCoordEntry('S');
    expect(s.latHem).toBe('S');
  });
});

describe('applyKey — digit filling', () => {
  it('fills latDeg up to 2 digits then auto-advances cursor to latMin', () => {
    let s = applyKey(base, '4');
    expect(s.latDeg).toBe('4');
    expect(s.cursor).toBe('latDeg');
    s = applyKey(s, '1');
    expect(s.latDeg).toBe('41');
    expect(s.cursor).toBe('latMin'); // auto-advanced
  });

  it('moves to latMin after 2 latDeg digits', () => {
    let s = applyKey(applyKey(base, '4'), '1');
    s = applyKey(s, '1');
    expect(s.latMin).toBe('1');
  });

  it('fills latMin up to 4 digits', () => {
    let s: CoordEntryState = { ...base, latDeg: '41', cursor: 'latMin' };
    s = applyKey(applyKey(applyKey(applyKey(s, '1'), '2'), '3'), '4');
    expect(s.latMin).toBe('1234');
    s = applyKey(s, '5');
    expect(s.latMin).toBe('1234'); // capped
  });

  it('fills lonDeg up to 3 digits then auto-advances cursor to lonMin', () => {
    let s: CoordEntryState = { ...base, latDeg: '41', latMin: '12', cursor: 'lonDeg' };
    s = applyKey(applyKey(applyKey(s, '0'), '3'), '4');
    expect(s.lonDeg).toBe('034');
    expect(s.cursor).toBe('lonMin');
  });
});

describe('applyKey — hemisphere override', () => {
  it('S overrides latHem to S in latDeg cursor', () => {
    const s = applyKey({ ...base, latHem: 'N' }, 'S');
    expect(s.latHem).toBe('S');
  });

  it('W sets lonHem to W when advancing via W from latMin', () => {
    const s = applyKey({ ...base, cursor: 'latMin', latDeg: '41', latMin: '12' }, 'W');
    expect(s.lonHem).toBe('W');
    expect(s.cursor).toBe('lonDeg');
  });

  it('E sets lonHem to E when advancing via E from latMin', () => {
    const s = applyKey({ ...base, cursor: 'latMin', latDeg: '41', latMin: '12' }, 'E');
    expect(s.lonHem).toBe('E');
    expect(s.cursor).toBe('lonDeg');
  });

  it('W overrides lonHem in lonDeg cursor', () => {
    const s = applyKey({ ...base, cursor: 'lonDeg', lonDeg: '03', lonHem: 'E', latDeg: '41', latMin: '12' }, 'W');
    expect(s.lonHem).toBe('W');
  });
});

describe('applyKey — advance to lon', () => {
  it('Space in latMin advances to lonDeg when lat has minimum data', () => {
    const s = applyKey({ ...base, cursor: 'latMin', latDeg: '41', latMin: '1' }, ' ');
    expect(s.cursor).toBe('lonDeg');
  });

  it('Enter in latMin advances to lonDeg', () => {
    const s = applyKey({ ...base, cursor: 'latMin', latDeg: '41', latMin: '1' }, 'Enter');
    expect(s.cursor).toBe('lonDeg');
  });

  it('Space in latMin sets hasError when no minute digit', () => {
    const s = applyKey({ ...base, cursor: 'latMin', latDeg: '41' }, ' ');
    expect(s.hasError).toBe(true);
    expect(s.cursor).toBe('latMin');
  });

  it('Space in latDeg sets hasError when no degree digit', () => {
    const s = applyKey(base, ' ');
    expect(s.hasError).toBe(true);
    expect(s.cursor).toBe('latDeg');
  });
});

describe('applyKey — Space within degrees', () => {
  it('Space in latDeg with a digit advances cursor to latMin', () => {
    const s = applyKey({ ...base, latDeg: '4' }, ' ');
    expect(s.cursor).toBe('latMin');
    expect(s.hasError).toBe(false);
  });

  it('Space in latDeg with no digits sets error', () => {
    const s = applyKey(base, ' ');
    expect(s.hasError).toBe(true);
    expect(s.cursor).toBe('latDeg');
  });

  it('Space in lonDeg with a digit advances cursor to lonMin', () => {
    const s = applyKey({ ...base, cursor: 'lonDeg', latDeg: '41', latMin: '12', lonDeg: '3' }, ' ');
    expect(s.cursor).toBe('lonMin');
    expect(s.hasError).toBe(false);
  });

  it('Space in lonDeg with no digits sets error', () => {
    const s = applyKey({ ...base, cursor: 'lonDeg', latDeg: '41', latMin: '12' }, ' ');
    expect(s.hasError).toBe(true);
    expect(s.cursor).toBe('lonDeg');
  });
});

describe('applyKey — backspace', () => {
  it('Backspace clears last latMin digit', () => {
    const s = applyKey({ ...base, cursor: 'latMin', latDeg: '41', latMin: '12' }, 'Backspace');
    expect(s.latMin).toBe('1');
  });

  it('Backspace from latMin returns to latDeg cursor when latMin is empty', () => {
    const s = applyKey({ ...base, cursor: 'latMin', latDeg: '41', latMin: '' }, 'Backspace');
    expect(s.cursor).toBe('latDeg');
  });

  it('Backspace clears last latDeg digit in latDeg cursor', () => {
    const s = applyKey({ ...base, cursor: 'latDeg', latDeg: '4' }, 'Backspace');
    expect(s.latDeg).toBe('');
  });

  it('Backspace from lonDeg returns to latMin cursor when lonDeg is empty', () => {
    const s = applyKey({ ...base, cursor: 'lonDeg', latDeg: '41', latMin: '12' }, 'Backspace');
    expect(s.cursor).toBe('latMin');
  });

  it('Backspace clears last lonMin digit', () => {
    const s = applyKey({ ...base, cursor: 'lonMin', latDeg: '41', latMin: '12', lonDeg: '034', lonMin: '15' }, 'Backspace');
    expect(s.lonMin).toBe('1');
  });

  it('Backspace from lonMin returns to lonDeg cursor when lonMin is empty', () => {
    const s = applyKey({ ...base, cursor: 'lonMin', latDeg: '41', latMin: '12', lonDeg: '034', lonMin: '' }, 'Backspace');
    expect(s.cursor).toBe('lonDeg');
  });
});

describe('applyKey — Return in lon', () => {
  it('Return with valid data clears error', () => {
    const full: CoordEntryState = { ...base, cursor: 'lonMin', latDeg: '41', latMin: '12', lonDeg: '034', lonMin: '15' };
    const s = applyKey(full, 'Enter');
    expect(s.hasError).toBe(false);
  });

  it('Return with missing lon data sets error', () => {
    const partial: CoordEntryState = { ...base, cursor: 'lonDeg', latDeg: '41', latMin: '12', lonDeg: '', lonMin: '' };
    const s = applyKey(partial, 'Enter');
    expect(s.hasError).toBe(true);
  });
});

describe('parseCoordEntry', () => {
  it('returns null when lat has no data', () => {
    expect(parseCoordEntry(base)).toBeNull();
  });

  it('returns null when only degrees filled (no minutes)', () => {
    expect(parseCoordEntry({ ...base, latDeg: '45', lonDeg: '34' })).toBeNull();
  });

  it('parses with minimum minute data (latMin "1" fills tens slot = 10 min)', () => {
    const s: CoordEntryState = {
      ...base, latDeg: '45', latMin: '1', lonDeg: '34', lonMin: '154',
    };
    const result = parseCoordEntry(s);
    expect(result).not.toBeNull();
    // latMin '1' → padEnd '1000' → 10.00 minutes
    expect(result!.lat).toBeCloseTo(45 + 10 / 60, 4);
    // lonMin '154' → padEnd '1540' → 15.40 minutes
    expect(result!.lon).toBeCloseTo(34 + 15.4 / 60, 4);
  });

  it('parses S41°12.30 W005°30.00', () => {
    const s: CoordEntryState = {
      ...base, latHem: 'S', latDeg: '41', latMin: '1230',
      lonHem: 'W', lonDeg: '005', lonMin: '3000',
    };
    const result = parseCoordEntry(s);
    expect(result).not.toBeNull();
    expect(result!.lat).toBeCloseTo(-(41 + 12.3 / 60), 4);
    expect(result!.lon).toBeCloseTo(-(5 + 30 / 60), 4);
  });

  it('returns null for lat degrees > 90', () => {
    const s: CoordEntryState = { ...base, latDeg: '91', latMin: '00', lonDeg: '034', lonMin: '15' };
    expect(parseCoordEntry(s)).toBeNull();
  });

  it('returns null for lon degrees > 180', () => {
    const s: CoordEntryState = { ...base, latDeg: '41', latMin: '12', lonDeg: '181', lonMin: '00' };
    expect(parseCoordEntry(s)).toBeNull();
  });

  it('pads missing decimal minutes with zeros', () => {
    const s: CoordEntryState = { ...base, latDeg: '45', latMin: '1', lonDeg: '34', lonMin: '15' };
    const result = parseCoordEntry(s)!;
    // latMin "1" → "1000" → 10.00 minutes
    expect(result.lat).toBeCloseTo(45 + 10 / 60, 4);
    // lonMin "15" → "1500" → 15.00 minutes
    expect(result.lon).toBeCloseTo(34 + 15 / 60, 4);
  });
});

describe('formatTemplate', () => {
  it('shows dashes for unfilled slots with cursor at start of latDeg', () => {
    // base: cursor='latDeg', all empty → § before first latDeg slot
    expect(formatTemplate(base)).toBe("N§––°––.––' E–––°––.––'");
  });

  it('shows cursor in latMin after latDeg is full', () => {
    const s: CoordEntryState = { ...base, latDeg: '41', latMin: '12', cursor: 'latMin' };
    // latMin='12' → cursor after 2nd digit, before decimal → "12.§––"
    expect(formatTemplate(s)).toBe("N41°12.§––' E–––°––.––'");
  });

  it('shows cursor at start of lonDeg after advancing', () => {
    const s: CoordEntryState = { ...base, latDeg: '41', latMin: '1230', cursor: 'lonDeg' };
    expect(formatTemplate(s)).toBe("N41°12.30' E§–––°––.––'");
  });

  it('shows fully filled template with cursor at end of lonMin (no visible cursor when full)', () => {
    const s: CoordEntryState = {
      ...base, latDeg: '41', latMin: '1230', lonDeg: '034', lonMin: '3000', cursor: 'lonMin',
    };
    // lonMin is full (4 digits), cursor position 4 is never inserted in loop 0..3
    expect(formatTemplate(s)).toBe("N41°12.30' E034°30.00'");
  });
});
