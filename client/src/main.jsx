import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyPrefs } from './theme/applyTheme';
import { readPrefs } from './theme/preferences';
import { i18nReady } from './i18n';
import './styles/tailwind.css';
import './styles/global.css';
import 'leaflet/dist/leaflet.css';
import { installChunkRecovery } from './utils/chunkRecovery';
import { freshStart } from './utils/freshStart';

// Apply theme synchronously before mounting React so Tailwind CSS
// variables are populated for the very first render.
applyPrefs(readPrefs());

// Remove responses cached by older releases; authenticated API data must not
// survive a logout or be served to another account.
if ('caches' in window) caches.delete('api-cache').catch(() => {});

// The classic bootstrap covers initial entry failures; development and
// deployments without that bootstrap use the same guarded recovery helper.
if (!window.__AYK_ASSET_RECOVERY__) installChunkRecovery();

// A visitor in another language than Arabic or English waits for that one small file first,
// so the first screen is never shown in the wrong language (AYK-249).
const render = () => createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
// AYK-328: a service provider's first page is their dashboard, a separate file. It was fetched only
// after the account was known, leaving the page empty for half a second. Fetch it right away.
try {
  if (localStorage.getItem('ayk_last_role') === 'provider') import('./pages/provider/ProviderDashboardPage').catch(() => {});
} catch (_) { /* private mode */ }

// AYK-323: the version check comes first, so an older saved copy is replaced before anything is
// drawn (one silent reload) instead of after the page has appeared. It takes 0.8 s at most.
const fresh = freshStart().catch(() => 'skip');
// Only while an older copy is being replaced (rare, a few seconds): a small spinner, not a blank page.
const waiting = setTimeout(() => {
  const root = document.getElementById('root');
  if (root && !root.firstChild) root.innerHTML = '<div style="display:grid;place-items:center;height:70vh"><div style="width:34px;height:34px;border:3px solid rgba(128,128,128,.3);border-top-color:currentColor;border-radius:50%;animation:ayk-spin 0.8s linear infinite"></div><style>@keyframes ayk-spin{to{transform:rotate(360deg)}}</style></div>';
}, 1200);
Promise.all([fresh, i18nReady.catch(() => {})]).then(([state]) => {
  clearTimeout(waiting);
  if (state === 'reloaded') return; // the new copy is loading: do not draw the old one
  const root = document.getElementById('root');
  // The spinner goes; server-written text for search engines stays for React to replace as before.
  if (root?.firstElementChild && !root.querySelector('.seo-static')) root.innerHTML = '';
  render();
});

// Never stay on an old saved copy of the site after a release (AYK-279).

