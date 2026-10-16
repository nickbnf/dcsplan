import React, { useEffect } from 'react';
import { NavLink, Outlet, Link, Navigate, useLocation } from 'react-router-dom';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { usePerformance } from '../contexts/PerformanceContext';
import { useAuth } from '../contexts/AuthContext';
import { usePlanSelection } from '../contexts/PlanSelectionContext';
import { AuthMenu } from './AuthMenu';

// Plan-scoped surfaces follow the active plan; the space-scoped surface (library)
// does not (AD-15). The clusters are separated by a divider so the dependency is
// visible rather than surprising.
const planTabs = [
  { label: 'NAV', to: '/' },
  { label: 'PERF', to: '/performance' },
  { label: 'ATTACK', to: '/attack' },
];
const spaceTabs = [{ label: 'LIBRARY', to: '/library' }];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  [
    'flex items-center px-4 h-full font-aero-label text-sm border-b-2 transition-colors',
    isActive
      ? 'border-avio-primary text-avio-primary bg-avio-panel'
      : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
  ].join(' ');

const RegimeConsistencyGuard: React.FC = () => {
  const { flightPlan, onFlightPlanUpdate } = useFlightPlan();
  const { performance } = usePerformance();

  useEffect(() => {
    const regimeIds = new Set(performance.regimes.map(r => r.id));
    const hasOrphans = flightPlan.points.some(p => p.regimeId && !regimeIds.has(p.regimeId));
    if (!hasOrphans) return;
    const newPoints = flightPlan.points.map(p =>
      p.regimeId && !regimeIds.has(p.regimeId) ? { ...p, regimeId: undefined } : p
    );
    onFlightPlanUpdate({ ...flightPlan, points: newPoints });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [performance.regimes]);

  return null;
};

const Layout: React.FC = () => {
  const { status } = useAuth();
  const { atHome, isLoadingSelection, activePlanName } = usePlanSelection();
  const location = useLocation();
  const onHome = location.pathname === '/plans';

  // Routing (AD-15): anonymous has no Home; a signed-in user with no active plan
  // belongs on Home.
  if (status !== 'authenticated' && onHome) return <Navigate to="/" replace />;
  if (atHome && !onHome) return <Navigate to="/plans" replace />;

  const showEditingTabs = !onHome;
  const showBreadcrumb = status === 'authenticated' && !onHome && !!activePlanName;

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
              title={activePlanName ?? undefined}
            >
              ‹ {activePlanName}
            </Link>
          )}
          {onHome && (
            <span className="flex items-center px-3 h-full font-aero-label text-sm text-gray-700">FLIGHT PLANS</span>
          )}
          {showEditingTabs && (
            <div className="flex h-full items-center">
              {/* Plan-scoped cluster */}
              {planTabs.map(({ label, to }) => (
                <NavLink key={to} to={to} end={to === '/'} className={tabClass}>{label}</NavLink>
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
          <AuthMenu />
          <Link to="/about" className="text-xs text-gray-500 hover:text-gray-900 underline font-aero-label">
            About
          </Link>
        </div>
      </div>

      {/* Screen content */}
      <div className="flex flex-1 overflow-hidden">
        {isLoadingSelection ? (
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
