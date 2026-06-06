import React, { useEffect } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useFlightPlan } from '../contexts/FlightPlanContext';
import { usePerformance } from '../contexts/PerformanceContext';

const tabs = [
  { label: 'NAV', to: '/' },
  { label: 'PERF', to: '/performance' },
  { label: 'ATTACK', to: '/attack' },
  { label: 'LIBRARY', to: '/library' },
];

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
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      <RegimeConsistencyGuard />
      {/* Top tab bar */}
      <div className="flex items-center justify-between h-11 bg-gray-50 border-b border-gray-300 shrink-0 px-2">
        {/* Tab buttons */}
        <div className="flex h-full">
          {tabs.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                [
                  'flex items-center px-4 h-full font-aero-label text-sm border-b-2 transition-colors',
                  isActive
                    ? 'border-avio-primary text-avio-primary bg-avio-panel'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300',
                ].join(' ')
              }
            >
              {label}
            </NavLink>
          ))}
        </div>

        {/* App title + About */}
        <div className="flex items-center gap-4 pr-2">
          <span className="text-sm font-aero-label text-gray-700">DCS Tactical Planner</span>
          <Link
            to="/about"
            className="text-xs text-gray-500 hover:text-gray-900 underline font-aero-label"
          >
            About
          </Link>
        </div>
      </div>

      {/* Screen content */}
      <div className="flex flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
