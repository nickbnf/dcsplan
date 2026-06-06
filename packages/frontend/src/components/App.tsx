import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from './Layout';
import PlannerApp from './PlannerApp';
import PerformancePage from './PerformancePage';
import AttackPlanningPage from './AttackPlanningPage';
import { TheatreLibraryPage } from './TheatreLibraryPage';
import { About } from './About';
import { FlightPlanProvider } from '../contexts/FlightPlanContext';
import { LibraryProvider } from '../contexts/LibraryContext';
import { PerformanceProvider } from '../contexts/PerformanceContext';

const App: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>DCSPlan - Tactical Flight Planner for DCS</title>
        <meta
          name="description"
          content="Plan missions for the DCS flight simulator. Generate detailed kneeboards for navigation, especially for aircraft with limited onboard systems."
        />
      </Helmet>
      <Routes>
        <Route element={<PerformanceProvider><FlightPlanProvider><LibraryProvider><Layout /></LibraryProvider></FlightPlanProvider></PerformanceProvider>}>
          <Route path="/" element={<PlannerApp />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/attack" element={<AttackPlanningPage />} />
          <Route path="/library" element={<TheatreLibraryPage />} />
        </Route>
        <Route path="/about" element={<About />} />
      </Routes>
    </>
  );
};

export default App;
