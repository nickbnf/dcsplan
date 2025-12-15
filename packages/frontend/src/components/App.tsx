import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import PlannerApp from './PlannerApp';
import { About } from './About';

const App: React.FC = () => {
  return (
    <>
      <Helmet>
        <title>DCSPlan - Tactical Flight Planner for DCS</title>
        <meta
          name="description"
          content="Plan missions for DCS flight simulators. Generate detailed kneeboards for navigation, especially for aircraft with limited onboard systems."
        />
      </Helmet>
      <Routes>
        <Route path="/" element={<PlannerApp />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </>
  );
};

export default App;
