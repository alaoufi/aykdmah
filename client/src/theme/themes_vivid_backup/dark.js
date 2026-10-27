import defaultTheme from './default';

// Rose — soft pink theme. Replaces the old "Midnight" entry but keeps
// the registry key 'dark' so any user with rivo_theme=dark in
// localStorage transitions seamlessly.

export default {
  ...defaultTheme,
  name: 'dark',
  label: 'Rose',
  labelKey: 'theme.rose',
  scheme: 'light',
  preview: { from: '#DB2777', to: '#F472B6' },

  color: {
    ...defaultTheme.color,

    bg:            '#FFF1F4',
    surface:       '#FFFFFF',
    'surface-alt': '#FCE7F3',
    overlay:       '#3F0D26',

    border:          '#FBCFE8',
    'border-strong': '#F9A8D4',

    fg:          '#3F0D26',
    'fg-muted':  '#831843',
    'fg-subtle': '#BE185D',

    primary:        '#DB2777',
    'primary-fg':   '#FFFFFF',
    'primary-soft': '#FCE7F3',
    'primary-from': '#DB2777',
    'primary-to':   '#F472B6',

    accent:        '#EC4899',
    'accent-fg':   '#FFFFFF',
    'accent-soft': '#FBCFE8',

    success:        '#059669',
    'success-soft': '#D1FAE5',
    warning:        '#D97706',
    'warning-soft': '#FEF3C7',
    danger:         '#BE123C',
    'danger-soft':  '#FFE4E6',
    info:           '#DB2777',
    'info-soft':    '#FCE7F3',
  },

  shadow: {
    sm:   '0 1px 2px rgba(190,24,93,.06), 0 1px 3px rgba(190,24,93,.05)',
    md:   '0 4px 14px -4px rgba(219,39,119,.10), 0 1px 3px rgba(190,24,93,.05)',
    lg:   '0 8px 24px -8px rgba(219,39,119,.14), 0 2px 6px -2px rgba(190,24,93,.06)',
    hero: '0 18px 40px -12px rgba(244,114,182,.40), 0 8px 16px -8px rgba(190,24,93,.15)',
  },
};
