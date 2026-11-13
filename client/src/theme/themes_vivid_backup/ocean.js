import defaultTheme from './default';

// Ocean — premium cool theme to demonstrate scalability.

export default {
  ...defaultTheme,
  name: 'ocean',
  label: 'Ocean',
  labelKey: 'theme.ocean',
  scheme: 'light',
  preview: { from: '#0E7490', to: '#06B6D4' },

  color: {
    ...defaultTheme.color,
    bg:            '#F0F9FF',
    surface:       '#FFFFFF',
    'surface-alt': '#E0F2FE',

    border:          '#BAE6FD',
    'border-strong': '#7DD3FC',

    primary:        '#0E7490',
    'primary-soft': '#CFFAFE',
    'primary-from': '#0E7490',
    'primary-to':   '#06B6D4',

    accent:        '#0891B2',
    'accent-soft': '#CFFAFE',
  },
};
