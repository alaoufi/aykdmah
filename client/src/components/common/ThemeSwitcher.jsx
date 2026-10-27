import { useState, useRef } from 'react';
import { useTheme } from '../../theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import SmartDropdown from './SmartDropdown';
import { MODES, PALETTES, SCALES } from '../../theme/preferences';

const MODE_ICONS = { light: '☀️', dark: '🌙', system: '📱' };
const SCALE_LABELS = { s: 'A−', m: 'A', l: 'A+', xl: 'A++' };

// Appearance: mode, colour, high contrast and text size (AYK-028).
export default function ThemeSwitcher({ className = '', variant = 'default' }) {
  const { t } = useTranslation();
  const { prefs, setPrefs, theme } = useTheme();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const compact = variant === 'compact';
  const swatch = PALETTES[prefs.palette]?.swatch;

  const buttonClass = compact
    ? 'inline-flex items-center justify-center w-10 h-10 rounded-pill bg-surface-alt hover:bg-border text-fg transition'
    : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-alt hover:bg-border text-fg text-[13px] font-semibold transition';
  const chip = active => `flex-1 px-2 py-1.5 rounded-pill border text-[12.5px] ${active ? 'border-primary bg-primary-soft font-bold' : 'border-border'}`;

  return (
    <div className={`relative ${className}`}>
      <button ref={btnRef} type="button" onClick={() => setOpen(v => !v)} className={buttonClass}
        aria-label={t('theme.label')} aria-expanded={open}>
        <span className="w-5 h-5 rounded-full ring-2 ring-white/40 shrink-0 grid place-items-center text-[11px]"
          style={{ background: `linear-gradient(135deg, ${theme.color.bg}, ${swatch})` }} aria-hidden="true" />
        {!compact && <span>{t('theme.label')}</span>}
        {!compact && <span className="text-[10px] opacity-70">▾</span>}
      </button>
      <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)} minWidth={260}>
        <div className="px-3 py-1 space-y-3 text-fg">
          <section>
            <div className="text-[11px] font-bold text-fg-subtle mb-1">{t('theme.mode')}</div>
            <div className="flex gap-1">
              {MODES.map(mode => <button key={mode} type="button" aria-pressed={prefs.mode === mode}
                className={chip(prefs.mode === mode)} onClick={() => setPrefs({ mode })}>
                {MODE_ICONS[mode]} {t(`theme.mode_${mode}`)}</button>)}
            </div>
          </section>
          <section>
            <div className="text-[11px] font-bold text-fg-subtle mb-1">{t('theme.color')}</div>
            <div className="flex gap-2">
              {Object.entries(PALETTES).map(([name, palette]) => (
                <button key={name} type="button" aria-pressed={prefs.palette === name} title={t(`theme.palette_${name}`)}
                  aria-label={t(`theme.palette_${name}`)} onClick={() => setPrefs({ palette: name })}
                  className={`w-8 h-8 rounded-full ring-offset-2 ring-offset-surface ${prefs.palette === name ? 'ring-2 ring-fg' : 'ring-1 ring-border'}`}
                  style={{ background: palette.swatch }} />
              ))}
            </div>
          </section>
          <section>
            <div className="text-[11px] font-bold text-fg-subtle mb-1">{t('theme.text_size')}</div>
            <div className="flex gap-1">
              {Object.keys(SCALES).map(scale => <button key={scale} type="button" aria-pressed={prefs.scale === scale}
                aria-label={t(`theme.scale_${scale}`)} className={chip(prefs.scale === scale)} onClick={() => setPrefs({ scale })}>
                {SCALE_LABELS[scale]}</button>)}
            </div>
          </section>
          <label className="flex items-center justify-between gap-2 text-[13px] cursor-pointer pb-1">
            <span>◐ {t('theme.high_contrast')}</span>
            <input type="checkbox" className="w-5 h-5 accent-primary" checked={prefs.contrast}
              onChange={e => setPrefs({ contrast: e.target.checked })} />
          </label>
        </div>
      </SmartDropdown>
    </div>
  );
}
