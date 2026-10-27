import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeProvider';

// Display the supplied SVG unchanged and trim only its transparent canvas.
// An explicit LTR wrapper keeps the brand's original orientation in RTL pages.
export default function RyzaLogo({ wordSize = 22, width, tone = 'color', tagline = false, taglineText, className = '' }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const darkBackground = tone === 'mono-light' || theme.scheme === 'dark';
  const logoWidth = width || Math.round(wordSize * 6.4);
  const logoSrc = darkBackground ? '/brand/awtad-logo-light.svg' : '/brand/awtad-logo.svg';

  return (
    <div dir="ltr" className={`inline-flex flex-col shrink-0 ${className}`} style={{ width: logoWidth, maxWidth: '100%' }}>
      <svg role="img" aria-label={t('common.brand')} viewBox="145 180 1510 300" width={1510} height={300}
        className="block w-full h-auto" style={{ transform: 'none' }}>
        <title>{t('common.brand')}</title>
        <image href={logoSrc} width={2000} height={760} />
      </svg>
      {tagline && taglineText && (
        <span dir="auto" className="mt-2 text-[12px] font-medium text-center"
          style={{ color: darkBackground ? 'rgb(var(--color-brand-ivory))' : 'rgb(var(--color-fg-muted))' }}>
          {taglineText}
        </span>
      )}
    </div>
  );
}

export function RyzaWordmark({ size = 22, color, className = '' }) {
  return <RyzaLogo wordSize={size} tone={color === '#F8F5EF' || color === '#FAF7F2' ? 'mono-light' : 'color'} className={className} />;
}

export function RyzaMark({ size = 36, className = '' }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  return (
    <picture dir="ltr" className={`inline-block shrink-0 ${className}`}>
      <img src={theme.scheme === 'dark' ? '/brand/awtad-icon-white.svg' : '/brand/awtad-icon.svg'}
        alt={t('common.brand')} width={1024} height={1024}
        decoding="async" style={{ width: size, height: size, objectFit: 'contain', transform: 'none' }} />
    </picture>
  );
}
