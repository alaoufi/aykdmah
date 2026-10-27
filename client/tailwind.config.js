// Tailwind reads all design tokens from CSS variables that the theme
// engine writes to :root at runtime. Switching themes is a single
// CSS-var swap — no rebuild, no re-render. See src/theme/README.md.

const cssVar = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-sans)',    'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Semantic tokens — preferred for all new code
        bg:              cssVar('bg'),
        surface:         cssVar('surface'),
        'surface-alt':   cssVar('surface-alt'),
        overlay:         cssVar('overlay'),
        border:          cssVar('border'),
        'border-strong': cssVar('border-strong'),
        fg:              cssVar('fg'),
        'fg-muted':      cssVar('fg-muted'),
        'fg-subtle':     cssVar('fg-subtle'),

        primary: {
          DEFAULT: cssVar('primary'),
          fg:      cssVar('primary-fg'),
          text:    cssVar('primary-text'),
          soft:    cssVar('primary-soft'),
          from:    cssVar('primary-from'),
          to:      cssVar('primary-to'),
        },
        accent: {
          DEFAULT: cssVar('accent'),
          fg:      cssVar('accent-fg'),
          soft:    cssVar('accent-soft'),
        },
        success: { DEFAULT: cssVar('success'), soft: cssVar('success-soft') },
        warning: { DEFAULT: cssVar('warning'), soft: cssVar('warning-soft') },
        danger:  { DEFAULT: cssVar('danger'),  soft: cssVar('danger-soft')  },
        info:    { DEFAULT: cssVar('info'),    soft: cssVar('info-soft')    },

        // Original brand colours stay unchanged in both light and dark modes.
        'brand-sky':   cssVar('brand-sky'),
        'brand-clay':  cssVar('brand-clay'),
        'brand-sand':  cssVar('brand-sand'),
        'brand-slate': cssVar('brand-slate'),
        'brand-ivory': cssVar('brand-ivory'),

        // Legacy palettes now share the active RYZA surfaces. Text utilities
        // are mapped separately in tailwind.css for contrast on dark surfaces.
        brand: {
          50: cssVar('brand-50'), 100: cssVar('brand-100'),
          200: cssVar('brand-200'), 300: cssVar('brand-300'),
          400: cssVar('brand-400'),
          500: cssVar('primary'),
          600: cssVar('primary'),
          700: cssVar('primary-from'),
          800: cssVar('primary-from'),
          900: cssVar('primary-from'),
        },
        sand: {
          50: cssVar('bg'), 100: cssVar('primary-soft'),
          200: cssVar('brand-200'), 300: cssVar('brand-300'),
          400: cssVar('brand-clay'), 500: cssVar('primary'),
          600: cssVar('primary-from'), 700: cssVar('primary-from'),
        },
        slate: {
          50: cssVar('surface-alt'), 100: cssVar('surface-alt'),
          200: cssVar('border'), 300: cssVar('border-strong'),
          400: cssVar('fg-subtle'), 500: cssVar('fg-muted'),
          600: cssVar('fg-muted'), 700: cssVar('fg'),
          800: cssVar('brand-slate'), 900: '#192833', 950: '#0D1821',
        },
        urgent:  { 50: '#f6dccd', 100: '#ecb89a', 500: '#b0573a', 600: '#8b4329', 700: '#6c331e' },
        cream:   cssVar('surface-alt'),
        ink:     cssVar('brand-slate'),
        paper:   cssVar('bg'),
      },
      backgroundImage: {
        // Themeable replacements for inline linear-gradient(...) styles
        'primary-grad': 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))',
        'accent-grad':  'linear-gradient(135deg, rgb(var(--color-accent)), rgb(var(--color-primary-to)))',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        soft: 'var(--shadow-sm)',
        card: 'var(--shadow-md)',
        lift: 'var(--shadow-lg)',
        hero: 'var(--shadow-hero)',
      },
      animation: {
        'pulse-dot': 'pulseDot 1.4s ease-in-out infinite',
        'fade-in':   'fadeIn 120ms ease-out',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { transform: 'scale(1)',  opacity: '1' },
          '50%':      { transform: 'scale(1.4)', opacity: '.6' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
