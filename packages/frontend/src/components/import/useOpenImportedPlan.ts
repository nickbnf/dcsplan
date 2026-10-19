import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlanSelection } from '../../contexts/PlanSelectionContext';
import { planPath } from '../../utils/planAddress';
import type { ImportOutcome } from '../../import/types';

/** After a signed-in import: list the created plan at once (so its address
 *  resolves before the next refresh, D8) and open it. */
export function useOpenImportedPlan(): (outcome: ImportOutcome) => void {
  const { notePlanCreated } = usePlanSelection();
  const navigate = useNavigate();
  return useCallback((outcome: ImportOutcome) => {
    const created = outcome.created;
    if (!created) return;
    notePlanCreated({ ...created, updatedAt: new Date().toISOString(), lastEditor: null });
    navigate(planPath(created.id, created.name));
  }, [notePlanCreated, navigate]);
}
