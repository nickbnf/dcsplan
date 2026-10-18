import * as Y from 'yjs';
import type {
  FlightPlan,
  FlightPlanTurnPoint,
  PlanLibraryRef,
  PlanMarker,
  AttackPlanningParams,
  AttackPlanningResults,
} from '../types/flightPlan';

const SCALAR_KEYS: (keyof FlightPlan & string)[] = [
  'theatre', 'name', 'declination', 'bankAngle', 'initTimeSec', 'initFob',
];

const POINT_REQUIRED: (keyof FlightPlanTurnPoint & string)[] = [
  'id', 'lat', 'lon', 'tas', 'alt', 'fuelFlow', 'windSpeed', 'windDir',
];
const POINT_OPTIONAL: (keyof FlightPlanTurnPoint & string)[] = [
  'groundAlt', 'name', 'waypointType', 'exitTimeSec', 'hack', 'comment', 'regimeId',
];
const POINT_ALL = [...POINT_REQUIRED, ...POINT_OPTIONAL];

const LIB_REF_KEYS: (keyof PlanLibraryRef & string)[] = ['uuid', 'comment'];
const MARKER_REQUIRED: (keyof PlanMarker & string)[] = ['id', 'type', 'lat', 'lon'];
const MARKER_OPTIONAL: (keyof PlanMarker & string)[] = ['name', 'range', 'comment'];
const MARKER_ALL = [...MARKER_REQUIRED, ...MARKER_OPTIONAL];

function diffIdKeyedArray<T extends Record<string, any>>(
  yArray: Y.Array<Y.Map<any>>,
  oldItems: T[] | undefined,
  newItems: T[] | undefined,
  idKey: string,
  allKeys: string[],
) {
  const oldArr = oldItems ?? [];
  const newArr = newItems ?? [];

  const oldById = new Map<string, { item: T; index: number }>();
  oldArr.forEach((item, i) => oldById.set(item[idKey], { item, index: i }));

  const newById = new Map<string, { item: T; index: number }>();
  newArr.forEach((item, i) => newById.set(item[idKey], { item, index: i }));

  // Remove items not in new (iterate in reverse to preserve indices)
  const toRemove: number[] = [];
  for (let i = 0; i < yArray.length; i++) {
    const yItem = yArray.get(i);
    const itemId = yItem.get(idKey) as string;
    if (!newById.has(itemId)) {
      toRemove.push(i);
    }
  }
  for (let i = toRemove.length - 1; i >= 0; i--) {
    yArray.delete(toRemove[i]);
  }

  // Build current Y.Array id→index map after removals
  const currentIds: string[] = [];
  for (let i = 0; i < yArray.length; i++) {
    currentIds.push(yArray.get(i).get(idKey) as string);
  }

  // Process new items in order: update existing or insert new
  for (let newIdx = 0; newIdx < newArr.length; newIdx++) {
    const newItem = newArr[newIdx];
    const itemId = newItem[idKey];
    const currentYIdx = currentIds.indexOf(itemId);

    if (currentYIdx === -1) {
      // Insert new item
      const yMap = new Y.Map<any>();
      for (const key of allKeys) {
        if (newItem[key] !== undefined) {
          yMap.set(key, newItem[key]);
        }
      }
      if (newIdx >= yArray.length) {
        yArray.push([yMap]);
      } else {
        yArray.insert(newIdx, [yMap]);
      }
      currentIds.splice(newIdx, 0, itemId);
    } else {
      // Update existing item
      const yItem = yArray.get(currentYIdx);
      for (const key of allKeys) {
        const newVal = newItem[key];
        const oldEntry = oldById.get(itemId);
        const oldVal = oldEntry?.item[key];
        if (newVal !== oldVal) {
          if (newVal === undefined) {
            yItem.delete(key);
          } else {
            yItem.set(key, newVal);
          }
        }
      }

      // Reorder if needed
      if (currentYIdx !== newIdx) {
        // Capture data before deleting
        const copy = new Y.Map<any>();
        for (const key of allKeys) {
          const val = yItem.get(key);
          if (val !== undefined) copy.set(key, val);
        }
        yArray.delete(currentYIdx);
        currentIds.splice(currentYIdx, 1);
        if (newIdx >= yArray.length) {
          yArray.push([copy]);
        } else {
          yArray.insert(newIdx, [copy]);
        }
        currentIds.splice(newIdx, 0, itemId);
      }
    }
  }
}

function diffAttackPlanning(
  yPlan: Y.Map<any>,
  oldAP: FlightPlan['attackPlanning'],
  newAP: FlightPlan['attackPlanning'],
) {
  if (!newAP && !oldAP) return;

  if (!newAP && oldAP) {
    yPlan.delete('attackPlanning');
    return;
  }

  if (newAP && !oldAP) {
    const yAP = new Y.Map<any>();
    const yParams = new Y.Map<any>();
    for (const [k, v] of Object.entries(newAP.params)) {
      yParams.set(k, v);
    }
    yAP.set('params', yParams);
    if (newAP.results) {
      const yResults = new Y.Map<any>();
      for (const [k, v] of Object.entries(newAP.results)) {
        yResults.set(k, v);
      }
      yAP.set('results', yResults);
    }
    yPlan.set('attackPlanning', yAP);
    return;
  }

  // Both exist — diff
  const yAP = yPlan.get('attackPlanning') as Y.Map<any>;

  // Diff params field-by-field
  const yParams = yAP.get('params') as Y.Map<any>;
  const oldParams = oldAP!.params;
  const newParams = newAP!.params;
  for (const key of Object.keys(newParams) as (keyof AttackPlanningParams)[]) {
    if (newParams[key] !== oldParams[key]) {
      yParams.set(key as string, newParams[key]);
    }
  }
  for (const key of Object.keys(oldParams) as (keyof AttackPlanningParams)[]) {
    if (!(key in newParams)) {
      yParams.delete(key as string);
    }
  }

  // Replace results as a whole
  const oldResults = oldAP!.results;
  const newResults = newAP!.results;
  if (!newResults && oldResults) {
    yAP.delete('results');
  } else if (newResults && !oldResults) {
    const yResults = new Y.Map<any>();
    for (const [k, v] of Object.entries(newResults)) {
      yResults.set(k, v);
    }
    yAP.set('results', yResults);
  } else if (newResults && oldResults) {
    const changed = (Object.keys(newResults) as (keyof AttackPlanningResults)[]).some(
      k => newResults[k] !== oldResults[k]
    ) || Object.keys(oldResults).length !== Object.keys(newResults).length;
    if (changed) {
      const yResults = new Y.Map<any>();
      for (const [k, v] of Object.entries(newResults)) {
        yResults.set(k, v);
      }
      yAP.set('results', yResults);
    }
  }
}

export function applyFlightPlanToYDoc(
  yDoc: Y.Doc,
  oldPlan: FlightPlan,
  newPlan: FlightPlan,
): void {
  const yPlan = yDoc.getMap('flightPlan');

  // Scalars
  for (const key of SCALAR_KEYS) {
    if ((newPlan as any)[key] !== (oldPlan as any)[key]) {
      yPlan.set(key, (newPlan as any)[key]);
    }
  }

  // The profile the plan flies (signed-in only, performance-profile): an
  // optional scalar, absent from anonymous plans.
  if (newPlan.profileId !== oldPlan.profileId) {
    if (newPlan.profileId === undefined) yPlan.delete('profileId');
    else yPlan.set('profileId', newPlan.profileId);
  }

  // Points
  if (!yPlan.has('points')) {
    yPlan.set('points', new Y.Array<Y.Map<any>>());
  }
  const yPoints = yPlan.get('points') as Y.Array<Y.Map<any>>;
  diffIdKeyedArray(yPoints, oldPlan.points, newPlan.points, 'id', POINT_ALL);

  // Library refs
  if (newPlan.libraryRefs || oldPlan.libraryRefs) {
    if (!yPlan.has('libraryRefs')) {
      yPlan.set('libraryRefs', new Y.Array<Y.Map<any>>());
    }
    const yRefs = yPlan.get('libraryRefs') as Y.Array<Y.Map<any>>;
    diffIdKeyedArray(yRefs, oldPlan.libraryRefs, newPlan.libraryRefs, 'uuid', LIB_REF_KEYS);
    if (!newPlan.libraryRefs && yRefs.length === 0) {
      yPlan.delete('libraryRefs');
    }
  }

  // Markers
  if (newPlan.markers || oldPlan.markers) {
    if (!yPlan.has('markers')) {
      yPlan.set('markers', new Y.Array<Y.Map<any>>());
    }
    const yMarkers = yPlan.get('markers') as Y.Array<Y.Map<any>>;
    diffIdKeyedArray(yMarkers, oldPlan.markers, newPlan.markers, 'id', MARKER_ALL);
    if (!newPlan.markers && yMarkers.length === 0) {
      yPlan.delete('markers');
    }
  }

  // Attack planning
  diffAttackPlanning(yPlan, oldPlan.attackPlanning, newPlan.attackPlanning);
}

function readYMapAsObject<T>(yMap: Y.Map<any>, keys: string[]): Partial<T> {
  const obj: any = {};
  for (const key of keys) {
    const val = yMap.get(key);
    if (val !== undefined) {
      obj[key] = val;
    }
  }
  return obj;
}

export function snapshotFromYDoc(yDoc: Y.Doc): FlightPlan {
  const yPlan = yDoc.getMap('flightPlan');

  const theatre = (yPlan.get('theatre') as string) ?? '';
  const name = (yPlan.get('name') as string) ?? '';
  const declination = (yPlan.get('declination') as number) ?? 0;
  const bankAngle = (yPlan.get('bankAngle') as number) ?? 45;
  const initTimeSec = (yPlan.get('initTimeSec') as number) ?? 0;
  const initFob = (yPlan.get('initFob') as number) ?? 0;
  const profileId = yPlan.get('profileId') as string | undefined;

  // Points
  const yPoints = yPlan.get('points') as Y.Array<Y.Map<any>> | undefined;
  const points: FlightPlanTurnPoint[] = [];
  if (yPoints) {
    for (let i = 0; i < yPoints.length; i++) {
      const yPt = yPoints.get(i);
      points.push(readYMapAsObject<FlightPlanTurnPoint>(yPt, POINT_ALL) as FlightPlanTurnPoint);
    }
  }

  // Library refs
  let libraryRefs: PlanLibraryRef[] | undefined;
  const yRefs = yPlan.get('libraryRefs') as Y.Array<Y.Map<any>> | undefined;
  if (yRefs && yRefs.length > 0) {
    libraryRefs = [];
    for (let i = 0; i < yRefs.length; i++) {
      libraryRefs.push(readYMapAsObject<PlanLibraryRef>(yRefs.get(i), LIB_REF_KEYS) as PlanLibraryRef);
    }
  }

  // Markers
  let markers: PlanMarker[] | undefined;
  const yMarkers = yPlan.get('markers') as Y.Array<Y.Map<any>> | undefined;
  if (yMarkers && yMarkers.length > 0) {
    markers = [];
    for (let i = 0; i < yMarkers.length; i++) {
      markers.push(readYMapAsObject<PlanMarker>(yMarkers.get(i), MARKER_ALL) as PlanMarker);
    }
  }

  // Attack planning
  let attackPlanning: FlightPlan['attackPlanning'];
  const yAP = yPlan.get('attackPlanning') as Y.Map<any> | undefined;
  if (yAP) {
    const yParams = yAP.get('params') as Y.Map<any>;
    const params: any = {};
    if (yParams) {
      yParams.forEach((v, k) => { params[k] = v; });
    }
    const yResults = yAP.get('results') as Y.Map<any> | undefined;
    let results: AttackPlanningResults | undefined;
    if (yResults) {
      results = {} as any;
      yResults.forEach((v, k) => { (results as any)[k] = v; });
    }
    attackPlanning = { params: params as AttackPlanningParams, ...(results ? { results } : {}) };
  }

  const plan: FlightPlan = {
    theatre, name, declination, bankAngle, initTimeSec, initFob, points,
    ...(profileId !== undefined ? { profileId } : {}),
    ...(libraryRefs ? { libraryRefs } : {}),
    ...(markers ? { markers } : {}),
    ...(attackPlanning ? { attackPlanning } : {}),
  };
  return plan;
}

export function seedYDoc(yDoc: Y.Doc, plan: FlightPlan): void {
  const emptyPlan: FlightPlan = {
    theatre: '', name: '', declination: 0, bankAngle: 0,
    initTimeSec: 0, initFob: 0, points: [],
  };
  applyFlightPlanToYDoc(yDoc, emptyPlan, plan);
}
