/**
 * Offers this device's local data to the account on a fresh sign-in
 * (capability: local-data-migration; add-local-data-import D7).
 *
 * `login()` marks the tab before the OAuth redirect; this component consumes
 * the mark once signed in. An empty account imports everything silently and
 * opens the imported plan; otherwise (or if the account's contents cannot be
 * read) the chooser is shown, with *Not now*. A reload never runs it again.
 */
import React, { useEffect, useRef, useState } from 'react';
import { SIGNING_IN_KEY, useAuth } from '../../contexts/AuthContext';
import { useSpaceAssets } from '../../contexts/SpaceAssetsContext';
import { usePlanSelection } from '../../contexts/PlanSelectionContext';
import { createPlan } from '../../api/planApi';
import { readLocalData } from '../../import/localSource';
import { fullySucceeded, importLocalData, isSpaceEmpty } from '../../import/localImport';
import { SELECT_ALL, type ImportSource } from '../../import/types';
import { LocalDataImportDialog } from './LocalDataImportDialog';
import { useOpenImportedPlan } from './useOpenImportedPlan';

function consumeSigningIn(): boolean {
  try {
    if (sessionStorage.getItem(SIGNING_IN_KEY) === null) return false;
    sessionStorage.removeItem(SIGNING_IN_KEY);
    return true;
  } catch {
    return false;
  }
}

export const LocalDataMigration: React.FC = () => {
  const { status } = useAuth();
  const { sync } = useSpaceAssets();
  const { refreshPlans } = usePlanSelection();
  const openImported = useOpenImportedPlan();
  const [chooser, setChooser] = useState<ImportSource | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !sync || started.current) return;
    started.current = true;
    if (!consumeSigningIn()) return;

    const offerWhatRemains = async () => {
      const remaining = await readLocalData().catch(() => null);
      if (remaining) setChooser(remaining);
    };

    void (async () => {
      try {
        const source = await readLocalData();
        if (!source) return;
        if (!(await isSpaceEmpty(refreshPlans, sync))) {
          setChooser(source);
          return;
        }
        const outcome = await importLocalData(source, SELECT_ALL, {
          sync,
          createPlan,
          listPlanIds: async () => (await refreshPlans()).map(p => p.id),
        });
        if (fullySucceeded(outcome)) {
          openImported(outcome);
          return;
        }
        // Not everything made it: what is left stays local and is offered again.
        await offerWhatRemains();
      } catch (err) {
        // Whatever failed, nothing un-imported has left the device: offer it
        // again (and it stays on /plans).
        console.warn('Importing local data failed', err);
        await offerWhatRemains();
      }
    })();
  }, [status, sync, refreshPlans, openImported]);

  if (!chooser) return null;
  return <LocalDataImportDialog source={chooser} cancelLabel="Not now" onClose={() => setChooser(null)} />;
};

export default LocalDataMigration;
