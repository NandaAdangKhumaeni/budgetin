import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

window.addEventListener('error', function(e) {
  document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace; z-index: 99999; position: relative; background: white;"><h2>Runtime Error:</h2><pre>' + (e.error ? e.error.stack : e.message) + '</pre></div>';
});
window.addEventListener('unhandledrejection', function(e) {
  document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace; z-index: 99999; position: relative; background: white;"><h2>Unhandled Promise:</h2><pre>' + (e.reason ? (e.reason.stack || e.reason) : e) + '</pre></div>';
});


// --- AUTH INTERCEPTOR ---
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  try {
    const user = JSON.parse(localStorage.getItem('budgetin_user') || '{}');
    if (user && user.id && typeof url === 'string' && url.includes('/BUDGETIN/api/')) {
      options.headers = {
        ...options.headers,
        'X-User-Id': user.id
      };
    }
  } catch(e) {}
  return originalFetch.apply(this, [url, options]);
};
// ------------------------



createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
