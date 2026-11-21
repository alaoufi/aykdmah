import { useEffect, useRef, useState } from 'react';

// AYK-416 (the owner: «أمام كل واحد ثلاث نقط: تعديل، تنشيط/إخفاء، حذف»): one small ⋮ per row that
// opens its actions, so admin lists stay short. `items`: [{ label, icon, onClick, danger, hidden }].
export default function RowMenu({ items, label = 'خيارات', testId = 'row-menu' }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = event => { if (!box.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  const shown = items.filter(item => item && !item.hidden);
  if (!shown.length) return null;
  return (
    <div ref={box} className="relative shrink-0" onClick={event => event.stopPropagation()}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} data-testid={testId}
        onClick={() => setOpen(v => !v)}
        style={{ width: 32, height: 32, minHeight: 0, padding: 0 }}
        className={`grid place-items-center rounded-full text-[18px] font-black leading-none ${open ? 'bg-slate-200 text-ink' : 'text-slate-500 hover:bg-slate-100'}`}>
        ⋮
      </button>
      {open && (
        <div role="menu" className="absolute z-30 end-0 mt-1 min-w-[150px] rounded-card border border-slate-200 bg-white shadow-card py-1" data-testid={`${testId}-panel`}>
          {shown.map(item => (
            <button key={item.label} type="button" role="menuitem"
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`w-full text-start flex items-center gap-2 px-3 py-2 text-[13px] font-semibold hover:bg-slate-50 ${item.danger ? 'text-rose-700' : 'text-ink'}`}>
              {item.icon && <span aria-hidden="true">{item.icon}</span>}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
