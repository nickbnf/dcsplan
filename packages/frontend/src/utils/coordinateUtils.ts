/**
 * Formats a decimal-degree coordinate as `D DDDº MM.mm'`
 * e.g. formatCoordinate(41.205, 'lat')  → "N 41°12.30'"
 *      formatCoordinate(-5.5,  'lon')   → "W 5°30.00'"
 */
export function formatCoordinate(decimal: number, axis: 'lat' | 'lon'): string {
  const abs = Math.abs(decimal);
  const deg = Math.trunc(abs);
  const minutes = (abs - deg) * 60;
  const dir = axis === 'lat'
    ? (decimal >= 0 ? 'N' : 'S')
    : (decimal >= 0 ? 'E' : 'W');
  return `${dir} ${deg}°${minutes.toFixed(2).padStart(5, '0')}'`;
}
