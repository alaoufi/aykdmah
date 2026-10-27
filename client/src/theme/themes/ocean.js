import defaultTheme from './default';

// Ocean — softened cyan/teal. Same hue, saturation capped at 60%.
// Original (vivid) version in ../themes_vivid_backup/ocean.js.

export default {
  ...defaultTheme,
  name: 'ocean',
  label: 'Ocean',
  labelKey: 'theme.ocean',
  scheme: 'light',
  preview: { from: '#206A7E', to: '#2C9BAE' },

  color: {
    ...defaultTheme.color,
    bg:            '#F3F8FC',
    surface:       '#FFFFFF',
    'surface-alt': '#E5F1F9',

    border:          '#C6E2F1',
    'border-strong': '#95CBE4',

    primary:        '#206A7E',
    'primary-soft': '#D8F3F5',
    'primary-from': '#206A7E',
    'primary-to':   '#2C9BAE',

    accent:        '#257F95',
    'accent-soft': '#D8F3F5',
  },
};
