// Apply a theme to the document by writing CSS variables on :root.
// Kept dependency-free so we can also call it from inline scripts
// before React loads (FOUC prevention).

import { themeToCssVars, validateTheme } from './tokens';
import { getTheme } from './themes';

export const THEME_STORAGE_KEY = 'ryza_theme';

export function applyTheme(name) {
  if (typeof document === 'undefined') return null;
  const theme = getTheme(name);
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
