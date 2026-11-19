import { useTranslation } from 'react-i18next';

// «مترجم تلقائيًا · عرض الأصل» under a translated request (AYK-229).
export default function TranslatedNote({ translation, className = '' }) {
  const { t } = useTranslation();
  if (!translation.available) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] text-fg-muted ${className}`} data-testid="request-translated">
      {translation.translated && <span>🌐 {t('request.auto_translated')} ·</span>}
      <button type="button" className="font-semibold text-primary" data-testid="request-translation-toggle"
        onClick={event => { event.stopPropagation(); translation.toggle(); }}>
        {translation.translated ? t('request.show_original') : t('request.show_translation')}
      </button>
    </span>
  );
}
