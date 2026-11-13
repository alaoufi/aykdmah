import { AYK_PALETTE, brandTokens } from '../brandPalette';

// Ayk light: navy text, sand surfaces, terracotta actions and sky accents.

export default {
  name: 'default',
  label: 'Ay Khidma Light',
  labelKey: 'theme.brand_light',
  scheme: 'light',
  preview: { from: AYK_PALETTE.sky, to: AYK_PALETTE.clay },

  color: {
    ...brandTokens,
    // Surfaces
    bg:            AYK_PALETTE.ivory,
    surface:       '#FFFFFF',
    'surface-alt': AYK_PALETTE.sand,
    overlay:       AYK_PALETTE.slate,

    // Borders
    border:          '#D5C9B7',
    'border-strong': '#AC9778',

    // Foreground
    fg:          AYK_PALETTE.slate,
    'fg-muted':  '#425A70',
    'fg-subtle': '#596C7F',

    // A darker terracotta shade keeps white button labels readable.
    primary:        '#A45130',
    'primary-text': AYK_PALETTE.slate,
    'primary-fg':   '#FFFFFF',
    'primary-soft': AYK_PALETTE.sand,
    'primary-from': '#923F23',
    'primary-to':   '#A45130',

    // Accent (sky)
    accent:        AYK_PALETTE.sky,
    'accent-fg':   '#07192B',
    'accent-soft': '#E3EDF6',

    // Existing brand utilities follow the supplied Ayk palette.
    'brand-50':  AYK_PALETTE.ivory,
    'brand-100': '#F0E4D2',
    'brand-200': AYK_PALETTE.sand,
    'brand-300': '#D4A57A',
    'brand-400': AYK_PALETTE.clay,
    'hero-mid':  '#365F88',

    // Feedback
    success:        '#167558',
    'success-soft': '#E2F1E9',
    warning:        '#8D5C17',
    'warning-soft': '#FEF3C7',
    danger:         '#B83D3D',
    'danger-soft':  '#FEE2E2',
    info:           '#325F8B',
    'info-soft':    '#E3EDF6',
  },

  radius: {
    sm:   '6px',
    md:   '10px',
    lg:   '16px',
    card: '18px',
    pill: '999px',
  },

  shadow: {
    sm:   '0 1px 2px rgba(11,45,86,.05), 0 1px 3px rgba(11,45,86,.06)',
    md:   '0 4px 14px -4px rgba(11,45,86,.08), 0 1px 3px rgba(11,45,86,.05)',
    lg:   '0 8px 24px -8px rgba(11,45,86,.10), 0 2px 6px -2px rgba(11,45,86,.05)',
    hero: '0 18px 40px -12px rgba(11,45,86,.24), 0 8px 16px -8px rgba(199,107,67,.16)',
  },

  font: {
    sans:    'Cairo, "Plus Jakarta Sans", system-ui, sans-serif',
    display: '"Plus Jakarta Sans", Cairo, system-ui, sans-serif',
  },

  motion: {
    fast: '120ms cubic-bezier(.4, 0, .2, 1)',
    base: '180ms cubic-bezier(.4, 0, .2, 1)',
    slow: '320ms cubic-bezier(.4, 0, .2, 1)',
  },
};
