import type { Aircraft } from '../types/flightPlan';

type ValidationResult = { ok: true; aircraft: Aircraft } | { ok: false; errors: string[] };

function isPositive(n: unknown): boolean {
  return typeof n === 'number' && n > 0;
}

function isNonNegNum(n: unknown): boolean {
  return typeof n === 'number' && n >= 0;
}

export function validatePerformancePackage(parsed: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, errors: ['File is not a valid JSON object.'] };
  }

  const obj = parsed as Record<string, unknown>;

  if (obj['version'] !== '1.0') {
    return { ok: false, errors: [`Unsupported file version: "${obj['version']}". Expected "1.0".`] };
  }

  const ac = obj['aircraft'];
  if (typeof ac !== 'object' || ac === null || Array.isArray(ac)) {
    return { ok: false, errors: ['Missing or invalid "aircraft" field.'] };
  }

  const a = ac as Record<string, unknown>;

  if (typeof a['model'] !== 'string') errors.push('"aircraft.model" must be a string.');
  if (typeof a['takeoffConfiguration'] !== 'string') errors.push('"aircraft.takeoffConfiguration" must be a string.');
  if (!isNonNegNum(a['taxiFuel'])) errors.push('"aircraft.taxiFuel" must be a number >= 0.');

  // Takeoff block
  const to = a['takeoff'];
  if (typeof to !== 'object' || to === null || Array.isArray(to)) {
    errors.push('"aircraft.takeoff" must be an object.');
  } else {
    const t = to as Record<string, unknown>;
    if (!isNonNegNum(t['timeSec'])) errors.push('"aircraft.takeoff.timeSec" must be a number >= 0.');
    if (!isNonNegNum(t['fuel'])) errors.push('"aircraft.takeoff.fuel" must be a number >= 0.');
    if (!isNonNegNum(t['distance'])) errors.push('"aircraft.takeoff.distance" must be a number >= 0.');

    if (errors.filter(e => e.includes('takeoff.')).length === 0) {
      const timeSec = t['timeSec'] as number;
      const fuel = t['fuel'] as number;
      const distance = t['distance'] as number;
      const positiveCount = [timeSec, fuel, distance].filter(v => v > 0).length;
      if (positiveCount > 0 && positiveCount < 3) {
        errors.push('Take-off block must be all-zero or all-positive (timeSec, fuel, and distance).');
      }
    }
  }

  // Regimes
  if (!Array.isArray(a['regimes'])) {
    errors.push('"aircraft.regimes" must be an array.');
  } else {
    const regimes = a['regimes'] as unknown[];
    const seenNames = new Set<string>();

    regimes.forEach((r, i) => {
      if (typeof r !== 'object' || r === null || Array.isArray(r)) {
        errors.push(`regime[${i}]: must be an object.`);
        return;
      }
      const regime = r as Record<string, unknown>;
      const prefix = `regime[${i}]`;

      if (typeof regime['id'] !== 'string' || !regime['id']) errors.push(`${prefix}: "id" must be a non-empty string.`);
      if (typeof regime['name'] !== 'string' || !regime['name']) {
        errors.push(`${prefix}: "name" must be a non-empty string.`);
      } else {
        const name = regime['name'] as string;
        if (seenNames.has(name)) {
          errors.push(`${prefix}: duplicate regime name "${name}".`);
        }
        seenNames.add(name);
      }

      const cruise = regime['cruise'];
      if (typeof cruise !== 'object' || cruise === null || Array.isArray(cruise)) {
        errors.push(`${prefix}: "cruise" must be an object.`);
      } else {
        const c = cruise as Record<string, unknown>;
        if (!isPositive(c['tas'])) errors.push(`${prefix}.cruise.tas must be > 0.`);
        if (!isPositive(c['ff'])) errors.push(`${prefix}.cruise.ff must be > 0.`);
      }

      if (regime['climb'] !== undefined && regime['climb'] !== null) {
        const climb = regime['climb'] as Record<string, unknown>;
        if (!isPositive(climb['tas'])) errors.push(`${prefix}.climb.tas must be > 0.`);
        if (!isPositive(climb['ff'])) errors.push(`${prefix}.climb.ff must be > 0.`);
        if (!isPositive(climb['roc'])) errors.push(`${prefix}.climb.roc must be > 0.`);
      }

      if (regime['descent'] !== undefined && regime['descent'] !== null) {
        const descent = regime['descent'] as Record<string, unknown>;
        if (!isPositive(descent['tas'])) errors.push(`${prefix}.descent.tas must be > 0.`);
        if (!isPositive(descent['ff'])) errors.push(`${prefix}.descent.ff must be > 0.`);
        if (!isPositive(descent['rod'])) errors.push(`${prefix}.descent.rod must be > 0.`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  // Build the Aircraft object, silently ignoring unknown keys
  const toObj = (a['takeoff'] as Record<string, unknown>);
  const aircraft: Aircraft = {
    model: a['model'] as string,
    takeoffConfiguration: a['takeoffConfiguration'] as string,
    taxiFuel: a['taxiFuel'] as number,
    takeoff: {
      timeSec: toObj['timeSec'] as number,
      fuel: toObj['fuel'] as number,
      distance: toObj['distance'] as number,
    },
    regimes: (a['regimes'] as Record<string, unknown>[]).map(r => {
      const regime: any = {
        id: r['id'],
        name: r['name'],
        cruise: { tas: (r['cruise'] as any).tas, ff: (r['cruise'] as any).ff },
      };
      if (r['comment'] !== undefined) regime.comment = r['comment'];
      if (r['climb'] != null) {
        regime.climb = { tas: (r['climb'] as any).tas, ff: (r['climb'] as any).ff, roc: (r['climb'] as any).roc };
      }
      if (r['descent'] != null) {
        regime.descent = { tas: (r['descent'] as any).tas, ff: (r['descent'] as any).ff, rod: (r['descent'] as any).rod };
      }
      return regime;
    }),
  };

  return { ok: true, aircraft };
}
