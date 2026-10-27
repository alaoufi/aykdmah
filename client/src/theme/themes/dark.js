import defaultTheme from './default';
import { AYK_PALETTE } from '../brandPalette';

// Keep the saved "dark" preference while applying the Ayk palette.
export default {
  ...defaultTheme,
  name: 'dark',
  label: 'Ay Khidma Dark',
  labelKey: 'theme.brand_dark',
  scheme: 'dark',
  preview: { from: AYK_PALETTE.slate, to: AYK_PALETTE.sky },

  color: {
    ...defaultTheme.color,
    bg:            '#07192B',
    surface:       '#0B2440',
    'surface-alt': AYK_PALETTE.slate,
    overlay:       '#040E18',
    border:          '#35587C',
    'border-strong': '#7298BD',
    fg:          AYK_PALETTE.ivory,
    'fg-muted':  '#D5E1EB',
    'fg-subtle': '#A8BED2',

    // Sand text stays readable on dark surfaces and tinted selection states.
    'primary-text': AYK_PALETTE.sand,
    'primary-soft': '#463026',
    accent:         AYK_PALETTE.sky,
    'accent-fg':    '#07192B',
    'accent-soft':  '#183D60',

    'brand-50':  '#2D241F',
    'brand-100': '#463026',
    'brand-200': '#674232',
    'brand-300': '#CE9270',
    'hero-mid':  AYK_PALETTE.slate,

    'success-soft': '#253E35',
    'warning-soft': '#473A28',
    'danger-soft':  '#482E31',
    'info-soft':    '#183D60',
  },

  shadow: {
    sm:   '0 1px 3px rgba(0,0,0,.18)',
    md:   '0 4px 14px -4px rgba(0,0,0,.28), 0 1px 3px rgba(0,0,0,.16)',
    lg:   '0 8px 24px -8px rgba(0,0,0,.36), 0 2px 6px -2px rgba(0,0,0,.22)',
    hero: '0 18px 40px -12px rgba(0,0,0,.42), 0 8px 16px -8px rgba(0,0,0,.24)',
  },
};
