import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// AYK-377 (the owner: «وصف خدمات مقدم الخدمة… يتمدد النص وينكمش بشكل جميل»). A text shown on a
// few lines that opens smoothly to its full height and closes again. The button appears only when
// the text is longer than those lines. With a translation, the reader sees it in their language,
// and «عرض الأصل» shows what the writer wrote.
export default function ExpandableText({ text, translated = null, lines = 3, className = '', testId = 'expandable-text', title = null }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [original, setOriginal] = useState(false);
  const [full, setFull] = useState(0);
  const [overflow, setOverflow] = useState(false);
  const body = useRef(null);
  const shown = translated && !original ? translated : text;
  const lineHeight = 1.65;
  const closedEm = lines * lineHeight;

  const measure = () => {
    const el = body.current;
    if (!el) return;
    const fontSize = parseFloat(getComputedStyle(el).fontSize) || 14;
    setFull(el.scrollHeight);
    setOverflow(el.scrollHeight > closedEm * fontSize + 2);
  };
  useLayoutEffect(measure, [shown, closedEm]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !body.current) return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(body.current);
    return () => observer.disconnect();
  }, []);

  if (!text) return null;
  return (
    <div className={`rounded-card bg-surface-alt border border-border px-3 py-2.5 ${className}`} data-testid={testId}>
      {title && <div className="text-[12px] font-bold text-fg-muted mb-1">📝 {title}</div>}
      <div className="relative">
        <div ref={body} className="text-[13.5px] text-fg whitespace-pre-line break-words overflow-hidden transition-[max-height] duration-500 ease-in-out"
          style={{ lineHeight, maxHeight: open || !overflow ? (full ? `${full}px` : 'none') : `${closedEm}em` }}
          data-open={open ? 'true' : 'false'}>
          {shown}
        </div>
        {overflow && !open && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-7"
            style={{ background: 'linear-gradient(to bottom, transparent, rgb(var(--color-surface-alt) / 0.95))' }} />
        )}
      </div>
      {(overflow || translated) && (
        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
          {overflow && (
            <button type="button" className="inline-flex items-center gap-1 text-[12.5px] font-bold text-primary bg-transparent border-0 p-0 cursor-pointer"
              onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(value => !value); }}
              aria-expanded={open} data-testid={`${testId}-toggle`}>
              {open ? t('provider.show_less') : t('provider.show_more')}
              <span className={`inline-block transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden="true">▾</span>
            </button>
          )}
          {translated && (
            <button type="button" className="text-[11.5px] text-fg-muted underline bg-transparent border-0 p-0 cursor-pointer"
              onClick={event => { event.preventDefault(); event.stopPropagation(); setOriginal(value => !value); }}
              data-testid={`${testId}-original`}>
              {original ? t('provider.show_translation') : t('request.show_original')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
