import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// AYK-475 (the owner: «يستطيع اختيار أكثر من منطقة وأكثر من مهنة»): a drop-down list where several can be
// ticked. Nothing ticked = all. The button shows the first choice and how many more («الرياض +2»).
//   options: [{ value, label }]   value: array of chosen values (strings)
export default function MultiPick({ icon, allLabel, ariaLabel, options, value, onChange, testId }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', key); };
  }, [open]);
  const chosen = options.filter(o => value.includes(o.value));
  const more = chosen.length > 1 ? chosen.length - 1 : 0;
  const toggle = (v) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v]);
  return (
    <div className="relative min-w-0" ref={box}>
      <button type="button" className="select !h-10 !min-h-0 !py-1 text-[13.5px] w-full text-start truncate" aria-haspopup="listbox"
        aria-expanded={open} aria-label={ariaLabel} onClick={() => setOpen(o => !o)} data-testid={testId}>
        {icon} {chosen.length ? chosen[0].label : allLabel}{more > 0 && <> <span dir="ltr" className="font-bold text-primary">+{more}</span></>}
      </button>
      {open && (
        <div className="absolute z-[950] mt-1 inset-x-0 min-w-[200px] rounded-card border border-border bg-surface shadow-lift p-1.5" data-testid={`${testId}-panel`}>
          <ul role="listbox" aria-multiselectable="true" className="m-0 p-0 list-none max-h-[min(34vh,280px)] overflow-y-auto">
            {options.map(o => {
              const on = value.includes(o.value);
              return (
                <li key={o.value}>
                  <button type="button" role="option" aria-selected={on} onClick={() => toggle(o.value)} data-testid={`${testId}-opt-${o.value}`}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-start text-[13.5px] text-fg ${on ? 'bg-brand-50 font-bold' : 'hover:bg-surface-2'}`}>
                    <span className={`grid place-items-center w-[18px] h-[18px] rounded border-2 shrink-0 text-[11px] leading-none ${on ? 'bg-primary border-primary text-white' : 'border-border'}`} aria-hidden="true">{on ? '✓' : ''}</span>
                    <span className="min-w-0 truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-1.5 pt-1.5 mt-1 border-t border-border">
            <button type="button" className="btn btn-primary btn-sm flex-1" onClick={() => setOpen(false)} data-testid={`${testId}-done`}>{t('home.pick_done')}</button>
            {value.length > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange([])} data-testid={`${testId}-clear`}>{t('home.pick_clear')}</button>}
          </div>
        </div>
      )}
    </div>
  );
}
