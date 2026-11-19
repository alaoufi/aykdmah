// Default light theme — AYK clay & sand.
// To add a new theme: duplicate this file, change the values, and
// register it in ./index.js. No component edits needed.

export default {
  name: 'default',
  label: 'Clay',
  labelKey: 'theme.clay',
  scheme: 'light',
  preview: { from: '#876239', to: '#A67C52' },

  color: {
    // Surfaces
    bg:            '#EFE7DA',
    surface:       '#FFFFFF',
    'surface-alt': '#F8F5EF',
    overlay:       '#0F172A',

    // Borders
    border:          '#E2D4BE',
    'border-strong': '#CDB792',

    // Foreground
    fg:          '#243341',
    'fg-muted':  '#5B6B78',
    'fg-subtle': '#9A8D7C',

    // Brand (clay)
    primary:        '#876239',
    'primary-fg':   '#FFFFFF',
    'primary-soft': '#F3E7D2',
    'primary-from': '#876239',
    'primary-to':   '#A67C52',

    // Accent (sky)
    accent:        '#6F9CB9',
    'accent-fg':   '#FFFFFF',
    'accent-soft': '#DCEAF2',

    // Feedback
    success:        '#059669',
    'success-soft': '#D1FAE5',
    warning:        '#D97706',
    'warning-soft': '#FEF3C7',
    danger:         '#DC2626',
    'danger-soft':  '#FEE2E2',
    info:           '#0EA5E9',
    'info-soft':    '#E0F2FE',
  },

  radius: {
    sm:   '6px',
    md:   '10px',
    lg:   '16px',
    card: '18px',
    pill: '999px',
  },

  shadow: {
    sm:   '0 1px 2px rgba(61,47,35,.05), 0 1px 3px rgba(61,47,35,.06)',
    md:   '0 4px 14px -4px rgba(61,47,35,.08), 0 1px 3px rgba(61,47,35,.05)',
    lg:   '0 8px 24px -8px rgba(61,47,35,.10), 0 2px 6px -2px rgba(61,47,35,.05)',
    hero: '0 18px 40px -12px rgba(166,124,82,.30), 0 8px 16px -8px rgba(61,47,35,.12)',
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
