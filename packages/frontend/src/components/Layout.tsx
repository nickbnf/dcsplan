import React, { useEffect } from 'react';
import { NavLink, Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { usePerformance } from '../contexts/PerformanceContext';
import { useAuth } from '../contexts/AuthContext';
import { usePlanSelection } from '../contexts/PlanSelectionContext';
import { AuthMenu } from './AuthMenu';
import { SyncIndicator } from './SyncIndicator';
import { SessionExpiredDialog } from './SessionExpiredDialog';
import { planPath } from '../utils/planAddress';

// Plan-scoped surfaces follow the active plan and live under its address
// (AD-16); the space-scoped surface (library) does not (AD-15). The clusters are
// separated by a divider so the dependency is visible rather than surprising.
const spaceTabs = [{ label: 'LIBRARY', to: '/library' }];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center px-4 h-full font-aero-label text-sm border-b-2 transition-colors',
    isActive
      ? 'border-avio-primary text-avio-primary bg-avio-panel'
      : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
  ].join(' ');

/**
 * Anonymous tier only: clear leg bindings whose regime no longer exists in the
 * single profile (performance-regime). Signed in, an unresolved regime may just
 * not have synced yet, so it is kept and computes as Manual at read time;
 * clearing it would write into the shared plan and erase the binding on every
 * device.
 */
export const RegimeConsistencyGuard: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate } = useFlightPlan();
  const { performance, tier } = usePerformance();

  useEffect(() => {
    if (tier !== 'anonymous') return;
    const regimeIds = new Set(performance.regimes.map(r => r.id));
    const hasOrphans = flightPlan.points.some(p => p.regimeId && !regimeIds.has(p.regimeId));
    if (!hasOrphans) return;
    const newPoints = flightPlan.points.map(p =>
      p.regimeId && !regimeIds.has(p.regimeId) ? { ...p, regimeId: undefined } : p
    );
    onFlightPlanUpdate({ ...flightPlan, points: newPoints });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performance.regimes, tier]);

  return null;
};

const Layout: React.FC = () => {
  const { status } = useAuth();
  const { atHome, isResolving, requestUnresolved, activePlanId, hasActivePlan, commitError } = usePlanSelection();
  const { flightPlan, flightPlanId } = useFlightPlan();
  const location = useLocation();
  const onHome = location.pathname === '/plans';
  // The space's Trash is off-plan like Home (soft-delete).
  const onTrash = location.pathname === '/trash';
  const offPlan = onHome || onTrash;
  const signedIn = status === 'authenticated';

  // Routing (AD-15, AD-16). Nothing is judged while auth or the plan list loads.
  if (!isResolving) {
    // An address that does not resolve: signed-in → Home, anonymous → their plan.
    if (requestUnresolved) return <Navigate to={signedIn ? '/plans' : '/p/local'} replace />;
    // Anonymous has no Home.
    if (!signedIn && offPlan) return <Navigate to="/" replace />;
    // A signed-in user with no plan to open belongs on Home.
    if (atHome && !offPlan) return <Navigate to="/plans" replace />;
  }

  // Tab links follow the active plan's address; the name is only trusted once
  // the loaded document is the active plan (otherwise the slug is corrected later).
  const planName = flightPlanId === activePlanId ? flightPlan.name : '';
  const planTabs = [
    { label: 'NAV', to: planPath(activePlanId, planName), end: true },
    { label: 'PERF', to: planPath(activePlanId, planName, 'perf'), end: false },
    { label: 'ATTACK', to: planPath(activePlanId, planName, 'attack'), end: false },
  ];

  const showEditingTabs = !offPlan;
  const showBreadcrumb = signedIn && !offPlan && hasActivePlan && !!planName;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <RegimeConsistencyGuard />
      {/* Top bar */}
      <div className="flex items-center justify-between h-11 bg-gray-50 border-b border-gray-300 shrink-0 px-2">
        <div className="flex items-center h-full">
          {showBreadcrumb && (
            <Link
              to="/plans"
              className="flex items-center px-3 h-full font-aero-label text-sm text-gray-600 hover:text-avio-primary truncate max-w-[12rem]"
              title={planName}
            >
              ‹ {planName}
            </Link>
          )}
          {onHome && (
            <span className="flex items-center px-3 h-full font-aero-label text-sm text-gray-700">FLIGHT PLANS</span>
          )}
          {onTrash && (
            <Link
              to="/plans"
              className="flex items-center px-3 h-full font-aero-label text-sm text-gray-600 hover:text-avio-primary"
            >
              ‹ FLIGHT PLANS
            </Link>
          )}
          {showEditingTabs && (
            <div className="flex h-full items-center">
              {/* Plan-scoped cluster */}
              {planTabs.map(({ label, to, end }) => (
                <NavLink key={label} to={to} end={end} className={tabClass}>{label}</NavLink>
              ))}
              {/* Divider: plan-scoped | space-scoped */}
              <span className="mx-2 h-5 w-px bg-gray-300" aria-hidden />
              {/* Space-scoped cluster */}
              {spaceTabs.map(({ label, to }) => (
                <NavLink key={to} to={to} className={tabClass}>{label}</NavLink>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 pr-2">
          <span className="text-sm font-aero-label text-gray-700">DCS Tactical Planner</span>
          <SyncIndicator />
          <SessionExpiredDialog />
          <AuthMenu />
          <Link to="/about" className="text-xs text-gray-500 hover:text-gray-900 underline font-aero-label">
            About
          </Link>
        </div>
      </div>

      {/* A new plan whose save to the account failed (kept, retried on reconnect). */}
      {commitError && (
        <div role="status" className="shrink-0 px-4 py-1.5 text-xs font-aero-label bg-amber-50 text-amber-800 border-b border-amber-200">
          {commitError}
        </div>
      )}

      {/* Screen content */}
      <div className="flex flex-1 overflow-hidden">
        {isResolving ? (
          <div className="flex-1 flex items-center justify-center text-sm text-gray-500 font-aero-label">
            Loading your plans…
          </div>
        ) : (
          <Outlet />
        )}
      </div>
    </div>
  );
};

export default Layout;
