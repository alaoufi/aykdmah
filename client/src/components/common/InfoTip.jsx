import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

// AYK-415 (the owner: «مختصر توضيحي تحت الحقل… وفيه (i) للتوضيح بالتفصيل»): a small (i) beside a
// field's name that opens its full explanation in place, and closes it again.
export function InfoButton({ open, onToggle, controls, label }) {
  const { t } = useTranslation();
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={controls}
      aria-label={`${t('common.more_info')}${label ? `: ${label}` : ''}`} title={t('common.more_info')} data-testid="info-button"
      style={{ width: 20, height: 20, minWidth: 20, minHeight: 0, padding: 0, borderRadius: 9999 }}
      className={`inline-grid place-items-center w-5 h-5 rounded-full border text-[11px] font-extrabold leading-none align-middle shrink-0 ${open ? 'bg-primary text-primary-fg border-primary' : 'border-primary/60 text-primary bg-transparent'}`}>
      i
    </button>
  );
}

export function InfoPanel({ id, open, children }) {
  if (!open || !children) return null;
  return (
    <div id={id} role="note" data-testid="info-panel"
      className="mt-1.5 rounded-card border border-primary/30 bg-primary-soft px-3 py-2 text-[12.5px] leading-relaxed text-fg whitespace-pre-line">
      {children}
    </div>
  );
}

// A label with an optional (i) and its panel, for forms that build their own fields.
export default function FieldLabel({ htmlFor, label, info, className = 'form-label' }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <span className="flex items-center gap-1.5">
        <label htmlFor={htmlFor} className={className}>{label}</label>
        {info && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={typeof label === 'string' ? label : ''} />}
      </span>
      {info && <InfoPanel id={panelId} open={open}>{info}</InfoPanel>}
    </>
  );
}
