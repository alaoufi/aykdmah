# Theme system

Centralised, scalable theming for the platform. Components consume **semantic tokens**, never hard-coded colours.

## Architecture at a glance

```
src/theme/
├── tokens.js          ← schema, validator, hex→rgb helper
├── applyTheme.js      ← writes CSS variables to :root + persists
├── ThemeProvider.jsx  ← React context, useTheme() hook
├── themes/
│   ├── index.js       ← registry (add new themes here)
│   ├── default.js     ← RYZA Clay (light)
│   ├── dark.js        ← Midnight (dark)
│   └── ocean.js       ← Ocean (cool premium)
```

### How theme switching works
1. `index.html` runs a tiny inline script **before** React mounts. It reads
   `localStorage.ryza_theme` and writes CSS variables on `<html>`. Result:
   zero FOUC, even on first paint.
2. `<ThemeProvider>` wraps the app in `main.jsx`, exposing `useTheme()`.
3. Tailwind utilities (`bg-primary`, `text-fg-muted`, `bg-primary-grad`,
   `shadow-card`, `rounded-card`) read those CSS vars. Switching a theme
   only changes the vars — no rebundle, no re-render storms.

## Adding a new theme

1. Create `themes/<name>.js` filling every key in `TOKEN_SCHEMA`.
2. Register it in `themes/index.js`.
3. That's it. The switcher in the header picks it up automatically and
   every component re-themes itself.

```js
// themes/sunset.js
import defaultTheme from './default';
export default {
  ...defaultTheme,
  name: 'sunset', label: 'Sunset', scheme: 'light',
  preview: { from: '#F97316', to: '#FB7185' },
  color: { ...defaultTheme.color, primary: '#F97316', /* … */ },
};
```

## Rules for component authors

- **Do** use Tailwind semantic utilities: `bg-primary`, `text-fg`, `border-border`.
- **Do** use CSS vars for inline gradients: `linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))`.
- **Don't** write `style={{ background: '#876239' }}` or `bg-[#876239]`. CI
  will not stop you, but the theme switcher won't be able to recolour you.
- **Don't** add a new colour token without giving it a *semantic* name
  (what it represents, not what it looks like).

## Verifying

```bash
# Switch theme at runtime
localStorage.setItem('ryza_theme', 'dark'); location.reload();

# Or via UI: header → ☀️/🌙 switcher
```
