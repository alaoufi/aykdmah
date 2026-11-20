import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// A message written in another language (the owner: «الرسائل المتبادلة مع الإدارة تصل لكل قارئ
// بلغته»): the server sends the original and, when it could, `<field>_translated` in this reader's
// language. The translation shows first, with «🌐 مترجم تلقائيًا · عرض الأصل» to switch back and forth.
// `compact` (a line in a list, often inside a link): only the translated text with a small 🌐 mark.
export default function TranslatedText({ text, translated, compact = false, className = '' }) {
  const { t } = useTranslation();
  const [original, setOriginal] = useState(false);
  const available = typeof translated === 'string' && translated.trim() !== '' && translated !== text;
  if (!available) return <>{text}</>;
  if (compact) return <span title={t('request.auto_translated')}>🌐 {translated}</span>;
  return (
    <>
      {original ? text : translated}
      <span className={`flex items-center gap-1.5 text-[11px] opacity-80 mt-1 whitespace-normal ${className}`} data-testid="message-translated">
        {!original && <span>🌐 {t('request.auto_translated')} ·</span>}
        <button type="button" className="font-semibold underline" data-testid="message-translation-toggle"
          onClick={event => { event.preventDefault(); event.stopPropagation(); setOriginal(value => !value); }}>
          {original ? t('request.show_translation') : t('request.show_original')}
        </button>
      </span>
    </>
  );
}
