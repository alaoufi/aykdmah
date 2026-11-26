import { useEffect, useRef, useState } from 'react';

// AYK-504 (the owner: «ثلاث نقط آخر السطر فيه تعديل / حظر / حذف / إخفاء»): the ⋮ at the end of a row with its actions.
// items: [{ key, label, icon, tone: 'danger' | 'warning' | 'success', onClick, disabled }]. Written in Arabic: the
// administration is Arabic only.
export default function RowMenu({ items, label = 'خيارات', testId = 'row-menu' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const tones = { danger: 'text-rose-700', warning: 'text-amber-700', success: 'text-emerald-700' };
  return (
    <div className="relative shrink-0" ref={ref}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} data-testid={testId}
        onClick={() => setOpen(v => !v)}
        className="w-9 h-9 grid place-items-center rounded-pill bg-transparent border-0 text-[20px] leading-none text-slate-600 hover:bg-slate-100 cursor-pointer">⋮</button>
      {open && (
        <div role="menu" data-testid={`${testId}-list`}
          className="absolute z-30 top-10 end-0 min-w-[150px] rounded-card bg-white border border-slate-200 shadow-lift py-1">
          {items.map(item => (
            <button key={item.key} type="button" role="menuitem" disabled={item.disabled} data-testid={`${testId}-${item.key}`}
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`w-full text-start px-3 py-2 text-[13px] font-semibold bg-transparent border-0 hover:bg-slate-50 disabled:opacity-40 cursor-pointer ${tones[item.tone] || 'text-ink'}`}>
              {item.icon && <span aria-hidden="true" className="me-1.5">{item.icon}</span>}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
