/**
 * Unresolved library refs are not drawn (add-library-profile-sync, task 6.2;
 * spec: map-objects).
 */
import { describe, it, expect } from 'vitest';
import { get as getProjection } from 'ol/proj';
import { buildPlanObjectsSource, buildThreatRingsSource } from './planObjectsLayer';
import type { LibraryObject } from '../types/flightPlan';

const proj = getProjection('EPSG:3857')!;
const library: LibraryObject[] = [
  { id: 'a', type: 'sam_site', lat: 42, lon: 41, range: 25 },
  { id: 'b', type: 'sam_site', lat: 43, lon: 42, range: 10 },
];
const refs = [{ uuid: 'a' }, { uuid: 'gone' }, { uuid: 'b' }];

describe('planObjectsLayer — unresolved refs', () => {
  it('draws exactly the resolved refs', () => {
    const source = buildPlanObjectsSource(refs, [], library, proj, null);
    expect(source.getFeatures().map(f => f.get('objectId')).sort()).toEqual(['a', 'b']);
  });

  it('draws range rings only for resolved ranged refs', () => {
    expect(buildThreatRingsSource(refs, [], library, proj).getFeatures()).toHaveLength(2);
  });

  it('does not throw when nothing resolves', () => {
    expect(buildPlanObjectsSource([{ uuid: 'gone' }], [], [], proj, null).getFeatures()).toEqual([]);
  });
});
