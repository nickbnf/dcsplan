import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { usePlanSelection } from '../contexts/PlanSelectionContext';
import { planPath, planSlug, type PlanTab } from '../utils/planAddress';

/**
 * Redirects to the active plan's canonical address (AD-16): used for the legacy
 * flat routes (`/`, `/performance`, `/attack`) and for a bare `/p/:id`. Waits
 * until the loaded document is the active plan, so it never uses a stale name.
 */
export const PlanRedirect: React.FC<{ tab?: PlanTab }> = ({ tab = 'nav' }) => {
  const { activePlanId, atHome } = usePlanSelection();
  const { flightPlan, flightPlanId } = useFlightPlan();
  if (atHome) return <Navigate to="/plans" replace />;
  if (flightPlanId !== activePlanId) return null;
  return <Navigate to={planPath(activePlanId, flightPlan.name, tab)} replace />;
};

/**
 * Keeps the address's slug in step with the plan's name (unify-plan-name D5): a
 * stale or missing slug, a local rename, or a rename synced from another device
 * replaces the address in place — same route, so the editor stays mounted, and
 * `replace`, so no history entry is added.
 */
export function useCanonicalPlanPath() {
  const { id, slug } = useParams();
  const { flightPlan, flightPlanId } = useFlightPlan();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!id || slug === undefined || flightPlanId !== id) return;
    const wanted = planSlug(flightPlan.name);
    if (slug === wanted) return;
    const prefix = `/p/${id}/${slug}`;
    const rest = location.pathname.startsWith(prefix) ? location.pathname.slice(prefix.length) : '';
    navigate(`/p/${id}/${wanted}${rest}${location.search}${location.hash}`, { replace: true });
  }, [id, slug, flightPlanId, flightPlan.name, location.pathname, location.search, location.hash, navigate]);
}

/** Parent element of `/p/:id/:slug`: canonicalizes the slug, renders the tab. */
export const PlanRoute: React.FC = () => {
  useCanonicalPlanPath();
  return <Outlet />;
};
