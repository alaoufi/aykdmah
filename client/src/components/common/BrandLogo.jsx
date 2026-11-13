import { useTranslation } from 'react-i18next';

// The «أي خدمة» logo. The artwork already contains the Arabic name, so it is shown
// as one image; the localized brand name stays available to screen readers.
export default function BrandLogo({ wordSize = 22, width, tone = 'color', tagline = false, taglineText, className = '' }) {
  const { t } = useTranslation();
  const size = width ? Math.min(width, 96) : Math.round(wordSize * 2.4);
  const darkBackground = tone === 'mono-light';
  return (
    <div className={`inline-flex items-center gap-2 shrink-0 ${className}`}>
      <img src="/brand/aykdmh-logo-256.webp" alt={t('common.brand')} width={256} height={256}
        decoding="async" style={{ width: size, height: size, objectFit: 'contain' }} />
      {tagline && taglineText && (
        <span dir="auto" className="text-[12px] font-medium"
          style={{ color: darkBackground ? 'rgb(var(--color-brand-ivory))' : 'rgb(var(--color-fg-muted))' }}>
          {taglineText}
        </span>
      )}
    </div>
  );
}

export function BrandWordmark({ size = 22, className = '' }) {
  return <BrandLogo wordSize={size} className={className} />;
}

export function BrandMark({ size = 36, className = '' }) {
  const { t } = useTranslation();
  return (
    <img src="/brand/aykdmh-logo-256.webp" alt={t('common.brand')} width={256} height={256} decoding="async"
      className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size, objectFit: 'contain' }} />
  );
}
