import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// AYK-375 (the owner: «رسالة منبثقة جميلة: تم الحفظ، وتختفي»). A short message in the middle of the
// screen that goes by itself. `flash(text)` from anywhere; <FlashHost /> is mounted once.
let push = null;
export const flash = (text, ms = 1800) => { push?.({ id: Date.now() + Math.random(), text, ms }); };

export default function FlashHost() {
  const [item, setItem] = useState(null);
  useEffect(() => { push = next => setItem(next); return () => { push = null; }; }, []);
  useEffect(() => {
    if (!item) return undefined;
    const timer = setTimeout(() => setItem(current => (current?.id === item.id ? null : current)), item.ms);
    return () => clearTimeout(timer);
  }, [item]);
  if (!item) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center pointer-events-none" aria-live="polite">
      <div role="status" data-testid="flash" className="pointer-events-auto px-6 py-4 rounded-card bg-surface text-fg text-[17px] font-extrabold shadow-lift border-2 border-emerald-300"
        style={{ animation: 'ayk-flash .25s ease-out' }} onClick={() => setItem(null)}>
        {item.text}
      </div>
      <style>{'@keyframes ayk-flash{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}'}</style>
    </div>,
    document.body
  );
}
