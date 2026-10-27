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
// The environment palettes also tint surfaces and borders.
export const PALETTES = {
  brand: { swatch: 'linear-gradient(135deg, #0B2D56, #A45130)' },
  // Saudi: the greens of the Saudi emblem and flag.
  saudi: {
    swatch: 'linear-gradient(135deg, #00502A, #0B8A47)',
    light: { primary: '#006C35', 'primary-from': '#00502A', 'primary-to': '#0B8A47', 'primary-soft': '#DDEFE4',
      bg: '#F4F8F5', 'surface-alt': '#E3EFE7', border: '#C5DCCD', 'border-strong': '#8DB59C', 'primary-text': '#0A3D24' },
    dark: { primary: '#006C35', 'primary-from': '#00502A', 'primary-to': '#0B8A47', 'primary-soft': '#133A26',
      bg: '#06170F', surface: '#0A2418', 'surface-alt': '#10301F', border: '#2A5A40', 'border-strong': '#5E9A78', 'primary-text': '#9CD9B4' },
  },
  // Desert: dunes and sand.
  desert: {
    swatch: 'linear-gradient(135deg, #7E4F1A, #DCC7A3)',
    light: { primary: '#9A6324', 'primary-from': '#7E4F1A', 'primary-to': '#B57A35', 'primary-soft': '#F3E6CC',
      bg: '#FBF6EC', 'surface-alt': '#F1E4CC', border: '#DFCBA6', 'border-strong': '#B99A68', 'primary-text': '#5A3A12' },
    dark: { primary: '#9A6324', 'primary-from': '#7E4F1A', 'primary-to': '#B57A35', 'primary-soft': '#3A2C1A',
      bg: '#1C150C', surface: '#261C10', 'surface-alt': '#33261A', border: '#5E4A30', 'border-strong': '#9C7E55', 'primary-text': '#E8C99A' },
  },
  // Mountain: grey rock, juniper green and highland mist.
  mountain: {
    swatch: 'linear-gradient(135deg, #3E4A52, #5B8170)',
    light: { primary: '#4A6B5D', 'primary-from': '#3A5649', 'primary-to': '#5B8170', 'primary-soft': '#E1E8E3',
      bg: '#F4F5F3', 'surface-alt': '#E4E7E2', border: '#C9CEC6', 'border-strong': '#959E92', 'primary-text': '#2F3D36' },
    dark: { primary: '#4A6B5D', 'primary-from': '#3A5649', 'primary-to': '#5B8170', 'primary-soft': '#23302B',
      bg: '#12161A', surface: '#1A2026', 'surface-alt': '#232B32', border: '#45525C', 'border-strong': '#7D8C96', 'primary-text': '#B4CFC2' },
  },
  // Sea: deep water, turquoise shallows and the coast.
  sea: {
    swatch: 'linear-gradient(135deg, #0B5770, #48B8C9)',
    light: { primary: '#0F6E8C', 'primary-from': '#0B5770', 'primary-to': '#1588AA', 'primary-soft': '#DDF0F5',
      bg: '#F2F8FA', 'surface-alt': '#DFEEF3', border: '#BCD9E3', 'border-strong': '#7FB3C6', 'primary-text': '#0A4357' },
    dark: { primary: '#0F6E8C', 'primary-from': '#0B5770', 'primary-to': '#1588AA', 'primary-soft': '#10384A',
      bg: '#061620', surface: '#0A2230', 'surface-alt': '#0F2D3E', border: '#2B5568', 'border-strong': '#5F95AA', 'primary-text': '#96D3E6' },
  },
  burgundy: {
    swatch: 'linear-gradient(135deg, #6E2232, #A43A4F)',
    light: { primary: '#8A2C3E', 'primary-from': '#6E2232', 'primary-to': '#A43A4F', 'primary-soft': '#F5E3E6' },
    dark: { primary: '#8A2C3E', 'primary-from': '#6E2232', 'primary-to': '#A43A4F', 'primary-soft': '#3F2228', 'primary-text': '#E8AEB9' },
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
