import defaultTheme from './default';

// Azraq — softened royal blue. Same hue as before, saturation capped
// at 60% so it stops screaming. Original (S=100%) lives in
// ../themes_vivid_backup/rajhi.js for a one-line revert.
//
// Label comes from i18n (theme.azraq) so it renders as "أزرق" in
// Arabic, "Blue" in English, "نیلا" in Urdu, "নীল" in Bangla,
// "नीला" in Hindi.

export default {
  ...defaultTheme,
  name: 'azraq',
  // Fallback label for the rare case i18n isn't loaded yet.
  label: 'Blue',
  labelKey: 'theme.azraq',
  scheme: 'light',
  preview: { from: '#2B43AD', to: '#5C71D6' },

  color: {
    ...defaultTheme.color,

    bg:            '#F6F7FD',
    surface:       '#FFFFFF',
    'surface-alt': '#EEF1FB',
    overlay:       '#0F163B',

    border:          '#DEE2F7',
    'border-strong': '#B9C1EE',

    fg:          '#0F163B',
    'fg-muted':  '#3A4280',
    'fg-subtle': '#7A82B0',

    // Primary — desaturated royal blue (same hue, 60% sat)
    primary:        '#2B43AD',
    'primary-fg':   '#FFFFFF',
    'primary-soft': '#E9ECFA',
    'primary-from': '#253793',
    'primary-to':   '#445CD0',

    accent:        '#5C71D6',
    'accent-fg':   '#FFFFFF',
    'accent-soft': '#E9ECFA',

    success:        '#0F7A3E',
    'success-soft': '#E1F5E9',
    warning:        '#B6883C',
    'warning-soft': '#FAF1D7',
    danger:         '#B91C1C',
    'danger-soft':  '#FEE2E2',
    info:           '#445CD0',
    'info-soft':    '#E9ECFA',
  },

  shadow: {
    sm:   '0 1px 2px rgba(37,55,147,.06), 0 1px 3px rgba(37,55,147,.05)',
    md:   '0 4px 14px -4px rgba(37,55,147,.10), 0 1px 3px rgba(37,55,147,.05)',
    lg:   '0 8px 24px -8px rgba(37,55,147,.14), 0 2px 6px -2px rgba(37,55,147,.06)',
    hero: '0 18px 40px -12px rgba(37,55,147,.30), 0 8px 16px -8px rgba(68,92,208,.18)',
  },
};
