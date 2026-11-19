import { useEffect, useRef, useState } from 'react';
import { pageZoom } from '../../utils/pageZoom';
import { createPortal } from 'react-dom';

// Dropdown that opens straight DOWN from the anchor element and
// always stays inside the viewport. Uses position:fixed via a portal
// so it can't be clipped by any ancestor's overflow / padding.
//
// Usage:
//   <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
//     ...menu content...
//   </SmartDropdown>
export default function SmartDropdown({ anchorRef, open, onClose, minWidth = 200, children }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, start: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef?.current;
      const p = panelRef?.current;
      if (!a || !p) return;
      const zoom = pageZoom();
      const box  = a.getBoundingClientRect();
      const rect = { top: box.top / zoom, bottom: box.bottom / zoom, left: box.left / zoom, right: box.right / zoom };
      const ph   = p.offsetHeight || 240;
      const pw   = Math.max(minWidth, p.offsetWidth || minWidth);
      const vw   = window.innerWidth / zoom;
      const vh   = window.innerHeight / zoom;
      const GAP  = 6;
      const MARGIN = 8;

      // Vertical: prefer below; flip above if no room.
      const spaceBelow = vh - rect.bottom;
      const top = (spaceBelow >= ph + MARGIN || spaceBelow >= vh - rect.top)
        ? rect.bottom + GAP
        : Math.max(MARGIN, rect.top - ph - GAP);

      // Horizontal: align to the anchor's start edge but clamp inside viewport.
      const rtl = document.documentElement.dir === 'rtl';
      let leftPx;
      if (rtl) {
        // align dropdown right edge with anchor right edge
        leftPx = rect.right - pw;
      } else {
        leftPx = rect.left;
      }
      leftPx = Math.min(Math.max(MARGIN, leftPx), vw - pw - MARGIN);
      setPos({ top, start: leftPx });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose?.();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      className="fixed z-[1000] rounded-card bg-surface shadow-lift border border-border py-1.5 animate-fade-in"
      style={{
        top:     pos.top,
        left:    pos.start,
        minWidth,
        maxWidth: 'calc(100vw - 16px)',
      }}
    >
      {children}
    </div>,
    document.body
  );
}
