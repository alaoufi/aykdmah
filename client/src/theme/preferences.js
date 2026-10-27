// Appearance preferences (AYK-028): light/dark/system mode, a colour palette,
// high contrast and a text size. They are layered over the light or dark base
// theme, so every component keeps using the same tokens.

import defaultTheme from './themes/default';
import dark from './themes/dark';

export const PREFS_KEY = 'ayk_theme_prefs';
export const LEGACY_KEY = 'ayk_theme';
export const MODES = ['light', 'dark', 'system'];
export const SCALES = { s: 0.92, m: 1, l: 1.1, xl: 1.22 };

// Every palette keeps white button labels readable (dark enough primaries).
export const PALETTES = {
  brand: { swatch: '#A45130' },
  green: {
    swatch: '#1F7A55',
    light: { primary: '#1F7A55', 'primary-from': '#16603F', 'primary-to': '#2A9467', 'primary-soft': '#E2F1E9' },
    dark: { primary: '#1F7A55', 'primary-from': '#16603F', 'primary-to': '#2A9467', 'primary-soft': '#1E3A2F', 'primary-text': '#9FD8BC' },
  },
  blue: {
    swatch: '#1F5FAF',
    light: { primary: '#1F5FAF', 'primary-from': '#174C8E', 'primary-to': '#2A75CF', 'primary-soft': '#E3EDF6' },
    dark: { primary: '#1F5FAF', 'primary-from': '#174C8E', 'primary-to': '#2A75CF', 'primary-soft': '#183D60', 'primary-text': '#A9CBF2' },
  },
  burgundy: {
    swatch: '#8A2C3E',
    light: { primary: '#8A2C3E', 'primary-from': '#6E2232', 'primary-to': '#A43A4F', 'primary-soft': '#F5E3E6' },
    dark: { primary: '#8A2C3E', 'primary-from': '#6E2232', 'primary-to': '#A43A4F', 'primary-soft': '#3F2228', 'primary-text': '#E8AEB9' },
  },
  sand: {
    swatch: '#8C6A3F',
    light: { primary: '#8C6A3F', 'primary-from': '#735630', 'primary-to': '#A5814F', 'primary-soft': '#F3EAD9' },
    dark: { primary: '#8C6A3F', 'primary-from': '#735630', 'primary-to': '#A5814F', 'primary-soft': '#3A3022', 'primary-text': '#E3CDA6' },
  },
};

const CONTRAST = {
  light: { bg: '#FFFFFF', surface: '#FFFFFF', 'surface-alt': '#F0F0F0', border: '#1A1A1A', 'border-strong': '#000000',
    fg: '#000000', 'fg-muted': '#1A1A1A', 'fg-subtle': '#333333', 'primary-text': '#000000' },
  dark: { bg: '#000000', surface: '#0A0A0A', 'surface-alt': '#1A1A1A', border: '#E5E5E5', 'border-strong': '#FFFFFF',
    fg: '#FFFFFF', 'fg-muted': '#F0F0F0', 'fg-subtle': '#D6D6D6', 'primary-text': '#FFFFFF' },
};

export const DEFAULT_PREFS = { mode: 'light', palette: 'brand', contrast: false, scale: 'm' };

export function normalizePrefs(value = {}) {
  return {
    mode: MODES.includes(value.mode) ? value.mode : DEFAULT_PREFS.mode,
    palette: Object.prototype.hasOwnProperty.call(PALETTES, value.palette) ? value.palette : DEFAULT_PREFS.palette,
    contrast: value.contrast === true,
    scale: Object.prototype.hasOwnProperty.call(SCALES, value.scale) ? value.scale : DEFAULT_PREFS.scale,
  };
}

export function readPrefs() {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return normalizePrefs(JSON.parse(stored));
    // Earlier versions stored only "dark" or "default".
    return normalizePrefs({ mode: localStorage.getItem(LEGACY_KEY) === 'dark' ? 'dark' : 'light' });
  } catch (_) { return { ...DEFAULT_PREFS }; }
}

export function systemPrefersDark() {
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; }
}

export function isDark(prefs, systemDark = systemPrefersDark()) {
  return prefs.mode === 'dark' || (prefs.mode === 'system' && systemDark);
}

// The composed theme object for the token engine.
export function resolveTheme(prefs, systemDark) {
  const darkMode = isDark(prefs, systemDark);
  const base = darkMode ? dark : defaultTheme;
  const tone = darkMode ? 'dark' : 'light';
  const palette = PALETTES[prefs.palette]?.[tone] || {};
  return {
    ...base,
    color: { ...base.color, ...palette, ...(prefs.contrast ? CONTRAST[tone] : {}) },
  };
}
