import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import './style.css';
import { initPlausible } from './utils/plausible';

// Initialize Plausible Analytics if enabled
initPlausible();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
