import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { applyTheme, readStoredTheme } from './theme/applyTheme';
import './i18n';
import './styles/tailwind.css';
import './styles/global.css';
import 'leaflet/dist/leaflet.css';
import { installChunkRecovery } from './utils/chunkRecovery';

// Apply theme synchronously before mounting React so Tailwind CSS
// variables are populated for the very first render.
applyTheme(readStoredTheme() || 'default');

// Remove responses cached by older releases; authenticated API data must not
// survive a logout or be served to another account.
if ('caches' in window) caches.delete('api-cache').catch(() => {});

// The classic bootstrap covers initial entry failures; development and
// deployments without that bootstrap use the same guarded recovery helper.
if (!window.__AYK_ASSET_RECOVERY__) installChunkRecovery();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>
);
