import React, { useEffect, useState } from 'react';
import { countReferences } from '../api/assetApi';
import { useSpaceAssets } from '../contexts/SpaceAssetsContext';

/**
 * How many plans reference a library entry or profile, for its delete
 * confirmation (capability: soft-delete; add-trash-and-soft-delete D3). The
 * server counts live plans when the dialog opens; deletion is never blocked by
 * the count. Offline, or when the count fails, other plans cannot be checked.
 */
export type ReferenceKind = 'entry' | 'profile';

export type ReferenceCount =
  | { status: 'loading' }
  | { status: 'counted'; count: number }
  | { status: 'unknown' };

/** Ask the server once, when mounted (the dialog opens). */
export function useReferenceCount(kind: ReferenceKind, id: string): ReferenceCount {
  const offline = useSpaceAssets().status?.connectivity === 'offline';
  const [result, setResult] = useState<ReferenceCount>({ status: 'loading' });

  useEffect(() => {
    if (offline) return;
    let cancelled = false;
    countReferences(kind, id).then(
      (count) => { if (!cancelled) setResult({ status: 'counted', count }); },
      () => { if (!cancelled) setResult({ status: 'unknown' }); },
    );
    return () => { cancelled = true; };
  }, [kind, id, offline]);

  return offline ? { status: 'unknown' } : result;
}

const plural = (n: number) => `${n} flight plan${n === 1 ? '' : 's'}`;

export function referenceCountMessage(kind: ReferenceKind, result: ReferenceCount): string {
  const restore = kind === 'entry'
    ? 'shown as a missing object until it is restored from the Trash'
    : 'flying Manual legs until it is restored from the Trash';
  switch (result.status) {
    case 'loading':
      return 'Checking which flight plans use it…';
    case 'unknown':
      return `Other flight plans could not be checked. Any plan that uses it keeps it, ${restore}.`;
    case 'counted':
      if (result.count === 0) return kind === 'entry' ? 'No flight plan uses it.' : 'No flight plan flies it.';
      return `${kind === 'entry' ? 'Used' : 'Flown'} by ${plural(result.count)}. ` +
        `${result.count === 1 ? 'It keeps' : 'They keep'} the reference, ${restore}.`;
  }
}

export const ReferenceCountNotice: React.FC<{ kind: ReferenceKind; id: string }> = ({ kind, id }) => {
  const result = useReferenceCount(kind, id);
  const used = result.status === 'counted' && result.count > 0;
  return (
    <span
      data-testid="reference-count"
      className={`block mt-2 ${used ? 'text-amber-700 font-medium' : 'text-gray-600'}`}
    >
      {referenceCountMessage(kind, result)}
    </span>
  );
};
