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
    
    // Check Network tab for Plausible requests
    console.log('\n📡 Network Check Instructions:');
    console.log('1. Open DevTools → Network tab');
    console.log('2. Filter by "plausible" or your endpoint domain');
    console.log('3. Look for POST requests to:', import.meta.env.VITE_PLAUSIBLE_ENDPOINT || 'plausible.io');
    console.log('4. Check for CORS errors (red requests)');
    console.log('5. Check response status codes (should be 202 for events)');
    
    // Try to test endpoint manually
    if (import.meta.env.VITE_PLAUSIBLE_ENDPOINT) {
      console.log('\n🧪 Testing endpoint connectivity...');
      fetch(import.meta.env.VITE_PLAUSIBLE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          n: 'pageview',
          u: window.location.href,
          d: import.meta.env.VITE_PLAUSIBLE_DOMAIN,
        }),
      })
        .then((r) => {
          console.log('✅ Endpoint test response:', {
            status: r.status,
            statusText: r.statusText,
            ok: r.ok,
            headers: Object.fromEntries(r.headers.entries()),
          });
        })
        .catch((e) => {
          console.error('❌ Endpoint test failed:', e);
        });
    }
    
    if (typeof (window as any).plausible !== 'undefined') {
      console.log('\n✅ Plausible is loaded');
      console.log('window.plausible type:', typeof (window as any).plausible);
    } else {
      console.error('\n❌ Plausible is NOT loaded - check initialization');
      console.error('Possible issues:');
      console.error('  - CORS blocking requests to endpoint');
      console.error('  - Endpoint not responding correctly');
      console.error('  - Package version incompatibility');
      console.error('  - Network/firewall blocking');
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
