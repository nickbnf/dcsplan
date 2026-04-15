import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Layout from './Layout';
import PlannerApp from './PlannerApp';
import PerformancePage from './PerformancePage';
import AttackPlanningPage from './AttackPlanningPage';
import { About } from './About';
import { FlightPlanProvider } from '../contexts/FlightPlanContext';

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
        <Route element={<FlightPlanProvider><Layout /></FlightPlanProvider>}>
          <Route path="/" element={<PlannerApp />} />
          <Route path="/performance" element={<PerformancePage />} />
          <Route path="/attack" element={<AttackPlanningPage />} />
        </Route>
        <Route path="/about" element={<About />} />
      </Routes>
    </>
  );
};

export default App;
