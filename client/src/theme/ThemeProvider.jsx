import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_LIST, DEFAULT_THEME, getTheme } from './themes';
import { applyPrefs } from './applyTheme';
import { readPrefs, normalizePrefs, resolveTheme, systemPrefersDark, DEFAULT_PREFS } from './preferences';

const ThemeContext = createContext({
  theme: getTheme(DEFAULT_THEME),
  themeName: DEFAULT_THEME,
  themes: THEME_LIST,
  prefs: DEFAULT_PREFS,
  setPrefs: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [prefs, setPrefsState] = useState(() => (typeof window === 'undefined' ? DEFAULT_PREFS : readPrefs()));
  const [systemDark, setSystemDark] = useState(() => (typeof window === 'undefined' ? false : systemPrefersDark()));

  // "System" follows the device setting live.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = event => setSystemDark(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    applyPrefs(prefs, systemDark);
    // Fixed elements measure the viewport; a new text size changes their units.
    window.dispatchEvent(new Event('resize'));
  }, [prefs, systemDark]);

  const value = useMemo(() => {
    const theme = resolveTheme(prefs, systemDark);
    return {
      theme,
      themeName: theme.name,
      themes: THEME_LIST,
      prefs,
      setPrefs: changes => setPrefsState(previous => normalizePrefs({ ...previous, ...changes })),
      // Kept for older callers: "dark" or "default".
      setTheme: name => setPrefsState(previous => normalizePrefs({ ...previous, mode: name === 'dark' ? 'dark' : 'light' })),
    };
  }, [prefs, systemDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
