import type { AssetSync } from '../sync/assetSync';
import { outboxKey, type AssetCacheState } from '../sync/assetCache';

export class AckTimeoutError extends Error {
  constructor() {
    super('The server did not confirm the import in time.');
  }
}

export interface AckRows {
  entries: string[];
  profiles: string[];
}

function acked(state: AssetCacheState, rows: AckRows): boolean {
  return rows.entries.every(id => state.entries[id]?.seq != null && !state.outbox[outboxKey('entry', id)])
    && rows.profiles.every(id => state.profiles[id]?.seq != null && !state.outbox[outboxKey('profile', id)]);
}

/**
 * Resolve once the server has acknowledged every given row: it holds a `seq`
 * and no write for it is pending. Rejects with AckTimeoutError after
 * `timeoutMs` (add-local-data-import D3). Writes still queued are not
 * cancelled: they are safe to deliver later.
 */
export function awaitAcked(sync: AssetSync, rows: AckRows, timeoutMs: number): Promise<void> {
  if (acked(sync.getState(), rows)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new AckTimeoutError());
    }, timeoutMs);
    const unsubscribe = sync.subscribe(() => {
      if (!acked(sync.getState(), rows)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}
