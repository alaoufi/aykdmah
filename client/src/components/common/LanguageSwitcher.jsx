import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../../i18n';
import SmartDropdown from './SmartDropdown';
import useCountry from '../../hooks/useCountry';

export default function LanguageSwitcher({ className = '', variant = 'default' }) {
  const { t, i18n } = useTranslation();
  const { country } = useCountry();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  // If the active country pins a subset of languages, only show those.
  // Empty / missing list → show all supported languages (fallback).
  const enabledCodes = Array.isArray(country?.languages_enabled) && country.languages_enabled.length
    ? country.languages_enabled
    : SUPPORTED_LANGUAGES.map((l) => l.code);
  const visibleLanguages = SUPPORTED_LANGUAGES.filter((l) => enabledCodes.includes(l.code));

  const current = visibleLanguages.find(l => l.code === i18n.resolvedLanguage)
    || SUPPORTED_LANGUAGES.find(l => l.code === i18n.resolvedLanguage)
    || SUPPORTED_LANGUAGES[0];

  const choose = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  const buttonClass = variant === 'light'
    ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/30 text-white text-[13px] font-semibold transition'
    : variant === 'compact'
    ? 'inline-flex items-center justify-center w-10 h-10 rounded-pill bg-surface-alt hover:bg-border text-fg text-[18px] transition'
    : 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-alt hover:bg-border text-fg text-[13px] font-semibold transition';

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        className={buttonClass}
        aria-label={t('language.label')}
        aria-expanded={open}
      >
        <span>{current.flag}</span>
        {variant !== 'compact' && <span>{current.label}</span>}
        {variant !== 'compact' && <span className="text-[10px] opacity-70">▾</span>}
      </button>
      <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)} minWidth={180}>
        {visibleLanguages.map(lang => (
          <button
            key={lang.code}
            type="button"
            onClick={() => choose(lang.code)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-[14px] hover:bg-surface-alt ${
              lang.code === current.code ? 'font-bold text-primary' : 'text-fg'
            }`}
            style={{ direction: lang.dir, textAlign: lang.dir === 'rtl' ? 'right' : 'left' }}
          >
            <span>{lang.flag}</span>
            <span className="flex-1">{lang.label}</span>
            {lang.code === current.code && <span className="text-primary">✓</span>}
          </button>
        ))}
      </SmartDropdown>
    </div>
  );
}
