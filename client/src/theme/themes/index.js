// Public AYK theme choices. Retired presets fall back to the brand light mode.

import defaultTheme from './default';
import dark from './dark';

export const THEMES = {
  default: defaultTheme,
  dark,
};

export const THEME_LIST = Object.values(THEMES);
export const DEFAULT_THEME = 'default';

export function getTheme(name) {
  return Object.prototype.hasOwnProperty.call(THEMES, name)
    ? THEMES[name]
    : THEMES[DEFAULT_THEME];
}
