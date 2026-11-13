// Apply a theme to the document by writing CSS variables on :root.
// Kept dependency-free so we can also call it from inline scripts
// before React loads (FOUC prevention).

import { themeToCssVars, validateTheme } from './tokens';
import { getTheme } from './themes';
import { PREFS_KEY, SCALES, normalizePrefs, resolveTheme } from './preferences';

export const THEME_STORAGE_KEY = 'ayk_theme';

export function applyTheme(name) {
  if (typeof document === 'undefined') return null;
  return writeTheme(getTheme(name));
}

// Mode, palette, contrast and text size (AYK-028). The legacy key keeps the
// resolved base name so older code and cached builds still read it.
export function applyPrefs(value, systemDark) {
  if (typeof document === 'undefined') return null;
  const prefs = normalizePrefs(value);
  const theme = writeTheme(resolveTheme(prefs, systemDark));
  const root = document.documentElement;
  root.setAttribute('data-contrast', prefs.contrast ? 'high' : 'normal');
  root.setAttribute('data-palette', prefs.palette);
  root.setAttribute('data-scale', prefs.scale);
  root.style.setProperty('--ayk-scale', String(SCALES[prefs.scale]));
  root.style.zoom = SCALES[prefs.scale] === 1 ? '' : String(SCALES[prefs.scale]);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) {}
  return theme;
}

function writeTheme(theme) {
  if (import.meta.env?.DEV) validateTheme(theme, theme.name);

  const root = document.documentElement;
  const vars = themeToCssVars(theme);
  for (const [prop, value] of vars) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute('data-theme', theme.name);
  root.style.colorScheme = theme.scheme || 'light';

  // The browser chrome follows the actual surface rather than a button colour.
  const themeColor = theme.color?.bg;
  if (themeColor) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', themeColor);
  }

  try { localStorage.setItem(THEME_STORAGE_KEY, theme.name); } catch (_) {}
  return theme;
}

export function readStoredTheme() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored ? getTheme(stored).name : null;
  } catch (_) { return null; }
}
