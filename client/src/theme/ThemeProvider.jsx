import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_LIST, DEFAULT_THEME, getTheme } from './themes';
import { applyTheme, readStoredTheme } from './applyTheme';

const ThemeContext = createContext({
  theme: getTheme(DEFAULT_THEME),
  themeName: DEFAULT_THEME,
  themes: THEME_LIST,
  setTheme: () => {},
});

export function ThemeProvider({ children, defaultName = DEFAULT_THEME }) {
  // Bootstrap with whatever is already on :root (set by the
  // pre-render inline script in index.html). Falls back to default.
  const [themeName, setThemeName] = useState(() => {
    if (typeof document !== 'undefined') {
      const fromAttr = document.documentElement.getAttribute('data-theme');
      if (fromAttr) return getTheme(fromAttr).name;
    }
    return getTheme(readStoredTheme() || defaultName).name;
  });

  useEffect(() => { applyTheme(themeName); }, [themeName]);

  const value = useMemo(() => ({
    theme: getTheme(themeName),
    themeName,
    themes: THEME_LIST,
    setTheme: (name) => {
      setThemeName(getTheme(name).name);
    },
  }), [themeName]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
