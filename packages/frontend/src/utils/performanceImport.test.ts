import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { validatePerformancePackage } from './performanceImport';

const validAircraft = {
  model: 'F-15E',
  takeoffConfiguration: 'MIL',
  taxiFuel: 400,
  takeoff: { timeSec: 75, fuel: 250, distance: 1.8 },
  regimes: [
    {
      id: 'r1',
      name: 'Alpha',
      cruise: { tas: 400, ff: 3600 },
    },
  ],
};

const validPackage = { version: '1.0', aircraft: validAircraft };

describe('validatePerformancePackage', () => {
  describe('acceptance cases', () => {
    it('accepts a fully-populated valid package', () => {
      const result = validatePerformancePackage(validPackage);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.aircraft.model).toBe('F-15E');
        expect(result.aircraft.regimes).toHaveLength(1);
      }
    });

    it('accepts empty regimes array', () => {
      const pkg = { version: '1.0', aircraft: { ...validAircraft, regimes: [] } };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
    });

    it('accepts all-zero takeoff block', () => {
      const pkg = {
        version: '1.0',
        aircraft: { ...validAircraft, takeoff: { timeSec: 0, fuel: 0, distance: 0 } },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
    });

    it('accepts regime with cruise only (no climb/descent)', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [{ id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } }],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
    });

    it('accepts regime with full climb and descent data', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [
            {
              id: 'r1',
              name: 'Alpha',
              cruise: { tas: 400, ff: 3600 },
              climb: { tas: 300, ff: 4000, roc: 2000 },
              descent: { tas: 350, ff: 2000, rod: 3000 },
            },
          ],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
    });

    it('silently ignores unknown keys at every level', () => {
      const pkg = {
        version: '1.0',
        unknownTopLevel: 'foo',
        aircraft: {
          ...validAircraft,
          unknownAircraftKey: 'bar',
          regimes: [
            {
              id: 'r1',
              name: 'Alpha',
              cruise: { tas: 400, ff: 3600, unknownCruiseKey: 999 },
              unknownRegimeKey: 'baz',
            },
          ],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
    });

    it('accepts taxiFuel = 0', () => {
      const pkg = { version: '1.0', aircraft: { ...validAircraft, taxiFuel: 0 } };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
    });
  });

  describe('rejection: version', () => {
    it('rejects wrong version', () => {
      const result = validatePerformancePackage({ version: '2.0', aircraft: validAircraft });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toMatch(/version/i);
    });

    it('rejects missing version', () => {
      const result = validatePerformancePackage({ aircraft: validAircraft });
      expect(result.ok).toBe(false);
    });

    it('rejects non-object input', () => {
      const result = validatePerformancePackage('not an object');
      expect(result.ok).toBe(false);
    });
  });

  describe('rejection: aircraft structure', () => {
    it('rejects missing aircraft field', () => {
      const result = validatePerformancePackage({ version: '1.0' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some(e => e.includes('aircraft'))).toBe(true);
    });

    it('rejects non-string model', () => {
      const result = validatePerformancePackage({ version: '1.0', aircraft: { ...validAircraft, model: 42 } });
      expect(result.ok).toBe(false);
    });

    it('rejects negative taxiFuel', () => {
      const result = validatePerformancePackage({ version: '1.0', aircraft: { ...validAircraft, taxiFuel: -1 } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some(e => e.includes('taxiFuel'))).toBe(true);
    });
  });

  describe('rejection: takeoff all-or-nothing', () => {
    it('rejects partial takeoff (only timeSec positive)', () => {
      const pkg = {
        version: '1.0',
        aircraft: { ...validAircraft, takeoff: { timeSec: 75, fuel: 0, distance: 0 } },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some(e => e.toLowerCase().includes('take-off') || e.toLowerCase().includes('takeoff'))).toBe(true);
    });

    it('rejects partial takeoff (only fuel and distance positive)', () => {
      const pkg = {
        version: '1.0',
        aircraft: { ...validAircraft, takeoff: { timeSec: 0, fuel: 250, distance: 1.8 } },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
    });

    it('rejects missing takeoff field', () => {
      const { takeoff: _, ...aircraftWithoutTakeoff } = validAircraft;
      const result = validatePerformancePackage({ version: '1.0', aircraft: aircraftWithoutTakeoff });
      expect(result.ok).toBe(false);
    });
  });

  describe('rejection: regime validation', () => {
    it('rejects duplicate regime name', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [
            { id: 'r1', name: 'Alpha', cruise: { tas: 400, ff: 3600 } },
            { id: 'r2', name: 'Alpha', cruise: { tas: 350, ff: 3200 } },
          ],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some(e => e.includes('duplicate'))).toBe(true);
    });

    it('rejects regime with empty id', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [{ id: '', name: 'Alpha', cruise: { tas: 400, ff: 3600 } }],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
    });

    it('rejects regime with empty name', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [{ id: 'r1', name: '', cruise: { tas: 400, ff: 3600 } }],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
    });

    it('rejects regime with non-positive cruise.tas', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [{ id: 'r1', name: 'Alpha', cruise: { tas: 0, ff: 3600 } }],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some(e => e.includes('cruise.tas'))).toBe(true);
    });

    it('rejects regime with negative climb.roc', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [
            {
              id: 'r1', name: 'Alpha',
              cruise: { tas: 400, ff: 3600 },
              climb: { tas: 300, ff: 4000, roc: -500 },
            },
          ],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some(e => e.includes('climb.roc'))).toBe(true);
    });

    it('rejects regime with missing descent.rod', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [
            {
              id: 'r1', name: 'Alpha',
              cruise: { tas: 400, ff: 3600 },
              descent: { tas: 300, ff: 2000 },
            },
          ],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some(e => e.includes('descent.rod'))).toBe(true);
    });
  });

  describe('output shape', () => {
    it('output aircraft does not include unknown keys', () => {
      const pkg = {
        version: '1.0',
        aircraft: { ...validAircraft, unknownKey: 'should be dropped' },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect((result.aircraft as any).unknownKey).toBeUndefined();
      }
    });

    it('output regime comment is preserved when present', () => {
      const pkg = {
        version: '1.0',
        aircraft: {
          ...validAircraft,
          regimes: [{ id: 'r1', name: 'Alpha', comment: 'MIL power', cruise: { tas: 400, ff: 3600 } }],
        },
      };
      const result = validatePerformancePackage(pkg);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.aircraft.regimes[0].comment).toBe('MIL power');
      }
    });
  });

  describe('cross-stack fixture validation (task 12)', () => {
    const SHARED = resolve(__dirname, '../../../../packages/shared');

    it('valid fixture passes validation', () => {
      const fixture = JSON.parse(readFileSync(resolve(SHARED, 'aircraft-package.valid.json'), 'utf-8'));
      const result = validatePerformancePackage(fixture);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.aircraft.model).toBe('F-15E Strike Eagle');
        expect(result.aircraft.regimes).toHaveLength(2);
      }
    });

    it('invalid fixture fails validation with reported errors', () => {
      const fixture = JSON.parse(readFileSync(resolve(SHARED, 'aircraft-package.invalid.json'), 'utf-8'));
      const result = validatePerformancePackage(fixture);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Should report at least one error (partial T/O or duplicate name)
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });
});
