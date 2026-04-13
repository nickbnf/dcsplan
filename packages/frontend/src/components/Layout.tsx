import React from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';

const tabs = [
  { label: 'NAV', to: '/' },
  { label: 'PERF', to: '/performance' },
  { label: 'ATTACK', to: '/attack' },
];

const Layout: React.FC = () => {
  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
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
