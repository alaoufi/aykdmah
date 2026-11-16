import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// A horizontal strip (tabs, filters) that scrolls sideways with its scrollbar hidden. Arrows appear
// on a side only while something is hidden on that side; they work in RTL and LTR. The selected
// item (activeKey changes) is scrolled into view.
export default function ScrollStrip({ children, className = '', activeKey }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const [hidden, setHidden] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 2) { setHidden({ left: false, right: false }); return; }
    const rtl = getComputedStyle(el).direction === 'rtl';
    const x = el.scrollLeft; // RTL browsers report 0 at the right edge and negative values leftwards
    setHidden(rtl ? { left: x > -max + 2, right: x < -2 } : { left: x > 2, right: x < max - 2 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure]);

  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector('[aria-selected="true"], [data-active="true"]');
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    const timer = setTimeout(measure, 350);
    return () => clearTimeout(timer);
  }, [activeKey, measure]);

  const scroll = (direction) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * Math.max(160, el.clientWidth * 0.7), behavior: 'smooth' });
  };

  const arrow = (side) => hidden[side] && (
    <button type="button" onClick={() => scroll(side === 'left' ? -1 : 1)}
      aria-label={t(side === 'left' ? 'common.scroll_left' : 'common.scroll_right')}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-1' : 'right-1'} z-10 w-8 h-8 rounded-full bg-white border border-slate-200 shadow-soft text-slate-700 text-[18px] leading-none grid place-items-center hover:bg-slate-50`}>
      {side === 'left' ? '‹' : '›'}
    </button>
  );

  return (
    <div className="relative">
      {arrow('left')}
      {arrow('right')}
      <div ref={ref} className={`overflow-x-auto no-scrollbar ${className}`}>{children}</div>
    </div>
  );
}
