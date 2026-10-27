import { useState, useRef } from 'react';
import { useTheme } from '../../theme/ThemeProvider';
import { useTranslation } from 'react-i18next';
import SmartDropdown from './SmartDropdown';

export default function ThemeSwitcher({ className = '', variant = 'default' }) {
  const { t } = useTranslation();
  const { themes, themeName, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  const current = themes.find(t => t.name === themeName) || themes[0];
  const compact = variant === 'compact';

  const buttonClass = compact
    ? 'inline-flex items-center justify-center w-10 h-10 rounded-pill bg-surface-alt hover:bg-border text-fg transition'
    : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-alt hover:bg-border text-fg text-[13px] font-semibold transition';

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={buttonClass}
        aria-label={t('theme.label', 'Theme')}
        aria-expanded={open}
      >
        <span
          className="w-5 h-5 rounded-full ring-2 ring-white/40 shrink-0"
          style={{ background: `linear-gradient(135deg, ${current.preview.from}, ${current.preview.to})` }}
        />
        {!compact && <span>{current.labelKey ? t(current.labelKey, current.label) : current.label}</span>}
        {!compact && <span className="text-[10px] opacity-70">▾</span>}
      </button>
      <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)} minWidth={220}>
        <div className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-fg-subtle">
          {t('theme.label', 'Theme')}
        </div>
        {themes.map((th) => (
          <button
            key={th.name}
            type="button"
            onClick={() => { setTheme(th.name); setOpen(false); }}
            className={`w-full flex items-center gap-3 px-3 py-2 text-[13.5px] hover:bg-surface-alt ${
              th.name === current.name ? 'font-bold text-primary' : 'text-fg'
            }`}
          >
            <span
              className="w-7 h-7 rounded-full ring-1 ring-border shrink-0"
              style={{ background: `linear-gradient(135deg, ${th.preview.from}, ${th.preview.to})` }}
            />
            <span className="flex-1 text-start">{th.labelKey ? t(th.labelKey, th.label) : th.label}</span>
            {th.name === current.name && <span className="text-primary">✓</span>}
          </button>
        ))}
      </SmartDropdown>
    </div>
  );
}
