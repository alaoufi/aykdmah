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
i18nReady.then(render, render);

// Never stay on an old saved copy of the site after a release (AYK-279).
freshStart().catch(() => {});
