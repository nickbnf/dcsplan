import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './components/App';
import './style.css';
import { initPlausible } from './utils/plausible';

// DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
console.log('[Plausible DEBUG] main.tsx: About to initialize Plausible', {
  timestamp: new Date().toISOString(),
  url: typeof window !== 'undefined' ? window.location.href : 'N/A',
});
// END DEBUG

// Initialize Plausible Analytics if enabled
initPlausible();

// DEBUG: PRODUCTION - REMOVE AFTER DEBUGGING
// Expose debug function to window for easy console access
if (typeof window !== 'undefined') {
  (window as any).plausibleDebug = () => {
    console.group('🔍 Plausible Analytics Debug (Production)');
    console.log('Environment:', import.meta.env.MODE);
    console.log('Domain:', import.meta.env.VITE_PLAUSIBLE_DOMAIN || 'NOT SET');
    console.log('Endpoint:', import.meta.env.VITE_PLAUSIBLE_ENDPOINT || 'NOT SET');
    console.log('window.plausible:', typeof (window as any).plausible !== 'undefined' ? 'Available' : 'NOT AVAILABLE');
    console.log('Current URL:', window.location.href);
    console.log('User Agent:', navigator.userAgent);
    if (typeof (window as any).plausible !== 'undefined') {
      console.log('✅ Plausible is loaded');
    } else {
      console.error('❌ Plausible is NOT loaded - check initialization');
    }
    console.groupEnd();
  };
  console.log('[Plausible DEBUG] Debug function available: window.plausibleDebug()');
}
// END DEBUG

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
