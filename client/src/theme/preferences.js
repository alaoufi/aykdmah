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
// A template recolours the whole page, not only its buttons: text greys,
// surfaces, borders, the dark hero band (brand-slate / hero-mid) and its two
// glows (brand-sky / brand-clay) all take the template's own hue.
export const PALETTES = {
  brand: { swatch: 'linear-gradient(135deg, #0B2D56, #A45130)' },
  // Saudi: the greens of the Saudi emblem and flag, mixed into the greys.
  saudi: {
    swatch: 'linear-gradient(135deg, #00502A, #0B8A47)',
    light: { primary: '#006C35', 'primary-from': '#00502A', 'primary-to': '#0B8A47', 'primary-soft': '#DDEFE4', 'primary-text': '#0A3D24',
      bg: '#F1F7F3', surface: '#FCFEFC', 'surface-alt': '#E1EEE6', border: '#C2D9CA', 'border-strong': '#8DB59C',
      fg: '#0E2A1C', 'fg-muted': '#3D5A4A', 'fg-subtle': '#557063',
      accent: '#1F7A4A', 'accent-fg': '#FFFFFF', 'accent-soft': '#E1F1E7', info: '#1F6B5C', 'info-soft': '#DFF0EA',
      'brand-slate': '#0B3D25', 'hero-mid': '#0F4F2F', 'brand-sky': '#3FAF6E', 'brand-clay': '#9CD3AE',
      'brand-sand': '#C2DFCD', 'brand-ivory': '#F1F7F3', overlay: '#0B3D25',
      'brand-50': '#F1F7F3', 'brand-100': '#DDEFE4', 'brand-200': '#C2DFCD', 'brand-300': '#8FC4A3', 'brand-400': '#3FAF6E' },
    dark: { primary: '#006C35', 'primary-from': '#00502A', 'primary-to': '#0B8A47', 'primary-soft': '#133A26', 'primary-text': '#9CD9B4',
      bg: '#06170F', surface: '#0A2418', 'surface-alt': '#10301F', border: '#2A5A40', 'border-strong': '#5E9A78',
      fg: '#E3F2E9', 'fg-muted': '#A9C7B5', 'fg-subtle': '#86A895',
      accent: '#3FB574', 'accent-fg': '#04140C', 'accent-soft': '#123A26', info: '#8FD3B0', 'info-soft': '#123A26',
      'brand-slate': '#04140C', 'hero-mid': '#0E4A2C', 'brand-sky': '#2FAE68', 'brand-clay': '#6FBF8A',
      'brand-sand': '#1B4630', 'brand-ivory': '#06170F', overlay: '#000000',
      'brand-50': '#0A2418', 'brand-100': '#10301F', 'brand-200': '#1B4630', 'brand-300': '#2F6B4A', 'brand-400': '#3FAF6E' },
  },
  // Desert: dunes, sand and the evening sun.
  desert: {
    swatch: 'linear-gradient(135deg, #7E4F1A, #DCC7A3)',
    light: { primary: '#9A6324', 'primary-from': '#7E4F1A', 'primary-to': '#B57A35', 'primary-soft': '#F3E6CC', 'primary-text': '#5A3A12',
      bg: '#FBF6EC', surface: '#FFFDF8', 'surface-alt': '#F1E4CC', border: '#DFCBA6', 'border-strong': '#B99A68',
      fg: '#3A2810', 'fg-muted': '#6A5233', 'fg-subtle': '#806A4C',
      accent: '#A8561C', 'accent-fg': '#FFFFFF', 'accent-soft': '#F6E8D2', info: '#7A5A2A', 'info-soft': '#F3E6CC',
      'brand-slate': '#4A2F12', 'hero-mid': '#5C3B18', 'brand-sky': '#E0B06A', 'brand-clay': '#C9733A',
      'brand-sand': '#E8D3AE', 'brand-ivory': '#FBF6EC', overlay: '#4A2F12',
      'brand-50': '#FBF6EC', 'brand-100': '#F3E6CC', 'brand-200': '#E8D3AE', 'brand-300': '#D2AE74', 'brand-400': '#B57A35' },
    dark: { primary: '#9A6324', 'primary-from': '#7E4F1A', 'primary-to': '#B57A35', 'primary-soft': '#3A2C1A', 'primary-text': '#E8C99A',
      bg: '#1C150C', surface: '#261C10', 'surface-alt': '#33261A', border: '#5E4A30', 'border-strong': '#9C7E55',
      fg: '#F5EBDD', 'fg-muted': '#D2C0A3', 'fg-subtle': '#B19E80',
      accent: '#D9A25E', 'accent-fg': '#1C150C', 'accent-soft': '#3A2C1A', info: '#D9B27A', 'info-soft': '#33261A',
      'brand-slate': '#120C05', 'hero-mid': '#4A3216', 'brand-sky': '#C99A55', 'brand-clay': '#B5651D',
      'brand-sand': '#4A3820', 'brand-ivory': '#1C150C', overlay: '#000000',
      'brand-50': '#261C10', 'brand-100': '#33261A', 'brand-200': '#4A3820', 'brand-300': '#7A5A30', 'brand-400': '#B57A35' },
  },
  // Mountain: grey rock, juniper green and highland mist.
  mountain: {
    swatch: 'linear-gradient(135deg, #3E4A52, #5B8170)',
    light: { primary: '#4A6B5D', 'primary-from': '#3A5649', 'primary-to': '#5B8170', 'primary-soft': '#E1E8E3', 'primary-text': '#2F3D36',
      bg: '#F2F4F1', surface: '#FCFDFC', 'surface-alt': '#E2E7E1', border: '#C7CEC4', 'border-strong': '#939D90',
      fg: '#1F2A27', 'fg-muted': '#4A5852', 'fg-subtle': '#5F6E67',
      accent: '#4D6E7D', 'accent-fg': '#FFFFFF', 'accent-soft': '#E2EAEE', info: '#4D6E7D', 'info-soft': '#E2EAEE',
      'brand-slate': '#26302E', 'hero-mid': '#33433C', 'brand-sky': '#8FB3A2', 'brand-clay': '#A9B8C2',
      'brand-sand': '#D0D6CE', 'brand-ivory': '#F2F4F1', overlay: '#26302E',
      'brand-50': '#F2F4F1', 'brand-100': '#E2E7E1', 'brand-200': '#D0D6CE', 'brand-300': '#A3B0A6', 'brand-400': '#5B8170' },
    dark: { primary: '#4A6B5D', 'primary-from': '#3A5649', 'primary-to': '#5B8170', 'primary-soft': '#23302B', 'primary-text': '#B4CFC2',
      bg: '#12161A', surface: '#1A2026', 'surface-alt': '#232B32', border: '#45525C', 'border-strong': '#7D8C96',
      fg: '#E6ECE9', 'fg-muted': '#B3C0BA', 'fg-subtle': '#93A39B',
      accent: '#8FB3A2', 'accent-fg': '#12161A', 'accent-soft': '#23302B', info: '#9CC0D0', 'info-soft': '#1E2C33',
      'brand-slate': '#0B0E10', 'hero-mid': '#2E3A40', 'brand-sky': '#7FA393', 'brand-clay': '#6D8796',
      'brand-sand': '#2F3A3F', 'brand-ivory': '#12161A', overlay: '#000000',
      'brand-50': '#1A2026', 'brand-100': '#232B32', 'brand-200': '#2F3A3F', 'brand-300': '#4E6359', 'brand-400': '#5B8170' },
  },
  // Sea: deep water, turquoise shallows and the sandy coast.
  sea: {
    swatch: 'linear-gradient(135deg, #0B5770, #48B8C9)',
    light: { primary: '#0F6E8C', 'primary-from': '#0B5770', 'primary-to': '#1588AA', 'primary-soft': '#DDF0F5', 'primary-text': '#0A4357',
      bg: '#F0F7FA', surface: '#FBFEFF', 'surface-alt': '#DCEDF3', border: '#BAD8E2', 'border-strong': '#7FB3C6',
      fg: '#082B3A', 'fg-muted': '#335C6B', 'fg-subtle': '#4E7381',
      accent: '#0E7A99', 'accent-fg': '#FFFFFF', 'accent-soft': '#DDF0F5', info: '#0E7A99', 'info-soft': '#DDF0F5',
      'brand-slate': '#06344A', 'hero-mid': '#08465C', 'brand-sky': '#48B8C9', 'brand-clay': '#E8C98F',
      'brand-sand': '#BCDFEA', 'brand-ivory': '#F0F7FA', overlay: '#06344A',
      'brand-50': '#F0F7FA', 'brand-100': '#DDF0F5', 'brand-200': '#BCDFEA', 'brand-300': '#7FC3D6', 'brand-400': '#48B8C9' },
    dark: { primary: '#0F6E8C', 'primary-from': '#0B5770', 'primary-to': '#1588AA', 'primary-soft': '#10384A', 'primary-text': '#96D3E6',
      bg: '#061620', surface: '#0A2230', 'surface-alt': '#0F2D3E', border: '#2B5568', 'border-strong': '#5F95AA',
      fg: '#E2F3F8', 'fg-muted': '#A6CBD8', 'fg-subtle': '#84AEBD',
      accent: '#5CC6D6', 'accent-fg': '#061620', 'accent-soft': '#10384A', info: '#96D3E6', 'info-soft': '#10384A',
      'brand-slate': '#020E15', 'hero-mid': '#0B4A60', 'brand-sky': '#48B8C9', 'brand-clay': '#C9A86A',
      'brand-sand': '#164058', 'brand-ivory': '#061620', overlay: '#000000',
      'brand-50': '#0A2230', 'brand-100': '#0F2D3E', 'brand-200': '#164058', 'brand-300': '#2B6A85', 'brand-400': '#48B8C9' },
  },
  burgundy: {
    swatch: 'linear-gradient(135deg, #6E2232, #A43A4F)',
    light: { primary: '#8A2C3E', 'primary-from': '#6E2232', 'primary-to': '#A43A4F', 'primary-soft': '#F5E3E6', 'primary-text': '#5A1626',
      bg: '#FBF5F6', surface: '#FFFDFD', 'surface-alt': '#F3E4E7', border: '#E2C6CC', 'border-strong': '#B98A94',
      fg: '#2E1016', 'fg-muted': '#5E3A42', 'fg-subtle': '#75535A',
      accent: '#A43A4F', 'accent-fg': '#FFFFFF', 'accent-soft': '#F5E3E6', info: '#8A2C3E', 'info-soft': '#F5E3E6',
      'brand-slate': '#3A1019', 'hero-mid': '#4E1622', 'brand-sky': '#C9707F', 'brand-clay': '#D9A35E',
      'brand-sand': '#EACBD1', 'brand-ivory': '#FBF5F6', overlay: '#3A1019',
      'brand-50': '#FBF5F6', 'brand-100': '#F5E3E6', 'brand-200': '#EACBD1', 'brand-300': '#C98B97', 'brand-400': '#A43A4F' },
    dark: { primary: '#8A2C3E', 'primary-from': '#6E2232', 'primary-to': '#A43A4F', 'primary-soft': '#3F2228', 'primary-text': '#E8AEB9',
      bg: '#160A0D', surface: '#201014', 'surface-alt': '#2B161B', border: '#563039', 'border-strong': '#8E5E68',
      fg: '#F6E6E9', 'fg-muted': '#D2B3B9', 'fg-subtle': '#B3939A',
      accent: '#E07A8E', 'accent-fg': '#160A0D', 'accent-soft': '#3F2228', info: '#E8AEB9', 'info-soft': '#3F2228',
      'brand-slate': '#0C0406', 'hero-mid': '#4A1724', 'brand-sky': '#C9707F', 'brand-clay': '#C99A55',
      'brand-sand': '#3F2228', 'brand-ivory': '#160A0D', overlay: '#000000',
      'brand-50': '#201014', 'brand-100': '#2B161B', 'brand-200': '#3F2228', 'brand-300': '#6E2232', 'brand-400': '#A43A4F' },
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
