// =============================================================
// Design tokens — semantic names only.
//
// This file is the canonical *contract* between the design system
// and every component. It defines WHAT a token represents (intent),
// not its literal value. Each theme under ./themes/ provides the
// literal RGB triplets for these names.
//
// Rules:
//   • Components must consume tokens via Tailwind utilities
//     (bg-primary, text-fg-muted, ...) or CSS variables
//     (var(--color-primary)). NEVER hardcode hex.
//   • Adding a new theme = creating one file under themes/
//     that fills these same keys. No component edits required.
//   • Color values are stored as "R G B" strings so Tailwind can
//     compose them with alpha values: rgb(var(--color-primary) / .5)
// =============================================================

export const TOKEN_SCHEMA = {
  color: [
    // Surfaces
    'bg',          // page background
    'surface',     // cards, panels
    'surface-alt', // softer / hover surface
    'overlay',     // modal/backdrop overlay

    // Borders
    'border',
    'border-strong',

    // Foreground (text)
    'fg',          // primary text
    'fg-muted',    // secondary text
    'fg-subtle',   // tertiary / placeholder

    // Brand
    'primary',
    'primary-text', // readable brand text, independently of button backgrounds
    'primary-fg',   // text on primary
    'primary-soft', // tinted background for primary
    'primary-from', // gradient start
    'primary-to',   // gradient end

    // Accent
    'accent',
    'accent-fg',
    'accent-soft',

    // Original AYK palette and legacy surface tints
    'brand-sky', 'brand-clay', 'brand-sand', 'brand-slate', 'brand-ivory',
    'brand-50', 'brand-100', 'brand-200', 'brand-300', 'brand-400',
    'hero-mid',

    // Feedback
    'success',
    'success-soft',
    'warning',
    'warning-soft',
    'danger',
    'danger-soft',
    'info',
    'info-soft',
  ],
  radius: ['sm', 'md', 'lg', 'card', 'pill'],
  shadow: ['sm', 'md', 'lg', 'hero'],
  font:   ['sans', 'display'],
  motion: ['fast', 'base', 'slow'],
};

// Helper: convert a hex string "#876239" → "135 98 57" (the format
// CSS vars use so Tailwind's `rgb(var(--x) / <alpha>)` works).
export function hexToRgbTriplet(hex) {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

// Map a theme object → flat list of [cssVar, value] pairs.
// Color values come in as hex; everything else passes through.
export function themeToCssVars(theme) {
  const out = [];
  for (const [name, value] of Object.entries(theme.color || {})) {
    out.push([`--color-${name}`, hexToRgbTriplet(value)]);
  }
  for (const [name, value] of Object.entries(theme.radius || {})) {
    out.push([`--radius-${name}`, value]);
  }
  for (const [name, value] of Object.entries(theme.shadow || {})) {
    out.push([`--shadow-${name}`, value]);
  }
  for (const [name, value] of Object.entries(theme.font || {})) {
    out.push([`--font-${name}`, value]);
  }
  for (const [name, value] of Object.entries(theme.motion || {})) {
    out.push([`--motion-${name}`, value]);
  }
  return out;
}

// Validate that a theme provides every required token. Used in dev
// to catch incomplete theme additions before they ship.
export function validateTheme(theme, name = 'theme') {
  const missing = [];
  for (const group of Object.keys(TOKEN_SCHEMA)) {
    for (const key of TOKEN_SCHEMA[group]) {
      if (!(theme[group] && theme[group][key] != null)) {
        missing.push(`${group}.${key}`);
      }
    }
  }
  if (missing.length && typeof console !== 'undefined') {
    console.warn(`[theme:${name}] missing tokens:`, missing);
  }
  return missing.length === 0;
}
