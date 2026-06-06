import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './components/App';
import './style.css';
import { initPlausible } from './utils/plausible';
import { bootstrapPerformanceFromLegacyPlan } from './utils/legacyMigration';

// Initialize Plausible Analytics if enabled
initPlausible();

// Migrate legacy flight plans that have aircraft embedded inline
bootstrapPerformanceFromLegacyPlan();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </React.StrictMode>,
);
