import defaultTheme from './default';

// Azraq — vivid royal blue theme. Label comes from i18n
// (theme.azraq) so it renders as "أزرق" in Arabic, "Blue" in English,
// "نیلا" in Urdu, "নীল" in Bangla, "नीला" in Hindi.

export default {
  ...defaultTheme,
  name: 'azraq',
  // Fallback label for the rare case i18n isn't loaded yet.
  label: 'Blue',
  labelKey: 'theme.azraq',
  scheme: 'light',
  preview: { from: '#0027D8', to: '#3357FF' },

  color: {
    ...defaultTheme.color,

    bg:            '#F4F6FF',
    surface:       '#FFFFFF',
    'surface-alt': '#EAEEFF',
    overlay:       '#000B40',

    border:          '#D6DDFF',
    'border-strong': '#A8B4FF',

    fg:          '#0A1340',
    'fg-muted':  '#3A4280',
    'fg-subtle': '#7A82B0',

    // Primary — the vivid royal blue from the screenshot
    primary:        '#0027D8',
    'primary-fg':   '#FFFFFF',
    'primary-soft': '#E4E8FF',
    'primary-from': '#001FB8',
    'primary-to':   '#1F44F5',

    accent:        '#3357FF',
    'accent-fg':   '#FFFFFF',
    'accent-soft': '#E4E8FF',

    success:        '#0F7A3E',
    'success-soft': '#E1F5E9',
    warning:        '#B6883C',
    'warning-soft': '#FAF1D7',
    danger:         '#B91C1C',
    'danger-soft':  '#FEE2E2',
    info:           '#1F44F5',
    'info-soft':    '#E4E8FF',
  },

  shadow: {
    sm:   '0 1px 2px rgba(0,31,184,.06), 0 1px 3px rgba(0,31,184,.05)',
    md:   '0 4px 14px -4px rgba(0,31,184,.10), 0 1px 3px rgba(0,31,184,.05)',
    lg:   '0 8px 24px -8px rgba(0,31,184,.14), 0 2px 6px -2px rgba(0,31,184,.06)',
    hero: '0 18px 40px -12px rgba(0,31,184,.40), 0 8px 16px -8px rgba(31,68,245,.20)',
  },
};
