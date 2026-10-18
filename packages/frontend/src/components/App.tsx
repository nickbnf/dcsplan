import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from './Layout';
import PlannerApp from './PlannerApp';
import PerformancePage from './PerformancePage';
import AttackPlanningPage from './AttackPlanningPage';
import { TheatreLibraryPage } from './TheatreLibraryPage';
import PlansHomePage from './PlansHomePage';
import { About } from './About';
import { PlanRedirect, PlanRoute } from './PlanRoutes';
import { FlightPlanProvider } from '../contexts/FlightPlanContext';
import { LibraryProvider } from '../contexts/LibraryContext';
import { PerformanceProvider } from '../contexts/PerformanceContext';
import { AuthProvider } from '../contexts/AuthContext';
import { PlanSelectionProvider } from '../contexts/PlanSelectionContext';
import { SpaceAssetsProvider } from '../contexts/SpaceAssetsContext';

/**
 * The route table (unify-plan-name D4). Plan-scoped views live under a plan's
 * address `/p/:id/:slug`; the library and the Flight Plans home do not. The old
 * flat routes redirect to the active plan's address.
 */
export const AppRoutes: React.FC = () => (
  <Routes>
    <Route element={<SpaceAssetsProvider><PlanSelectionProvider><FlightPlanProvider><PerformanceProvider><LibraryProvider><Layout /></LibraryProvider></PerformanceProvider></FlightPlanProvider></PlanSelectionProvider></SpaceAssetsProvider>}>
      <Route path="/" element={<PlanRedirect />} />
      <Route path="/performance" element={<PlanRedirect tab="perf" />} />
      <Route path="/attack" element={<PlanRedirect tab="attack" />} />
      <Route path="/plans" element={<PlansHomePage />} />
      <Route path="/library" element={<TheatreLibraryPage />} />
      <Route path="/p/:id" element={<PlanRedirect />} />
      <Route path="/p/:id/:slug" element={<PlanRoute />}>
        <Route index element={<PlannerApp />} />
        <Route path="perf" element={<PerformancePage />} />
        <Route path="attack" element={<AttackPlanningPage />} />
      </Route>
    </Route>
    <Route path="/about" element={<About />} />
  </Routes>
);

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Helmet>
        <title>DCSPlan - Tactical Flight Planner for DCS</title>
        <meta
          name="description"
          content="Plan missions for the DCS flight simulator. Generate detailed kneeboards for navigation, especially for aircraft with limited onboard systems."
        />
      </Helmet>
      <AppRoutes />
    </AuthProvider>
  );
};

export default App;
