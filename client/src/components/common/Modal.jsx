import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

// Responsive dialog.
// • Desktop: centred card, max-width = width.
// • Mobile (≤640px): bottom sheet that slides up, full-width, rounded
//   only at the top, drag-handle bar, respects iPhone safe-area.
export default function Modal({ open, title, children, onClose, footer, width = 520 }) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-grip" aria-hidden="true" />
        {title && (
          <div className="modal-header">
            <h3 style={{ margin: 0 }}>{title}</h3>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={t('common.close')}>✕</button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
      <style>{`
        .modal-backdrop {
          position: fixed; inset: 0; background: rgba(15, 23, 42, .55);
          display: grid; place-items: center; z-index: 1000; padding: 16px;
          animation: fade .15s ease;
        }
        .modal-content {
          background: var(--bg-card); width: 100%; border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg); max-height: 90vh; overflow: hidden;
          display: flex; flex-direction: column; animation: scaleIn .15s ease;
        }
        .modal-grip { display: none; }
        .modal-header {
          padding: 16px 20px; border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }
        .modal-header h3 { font-size: 17px; font-weight: 800; }
        .modal-body { padding: 20px; overflow: auto; -webkit-overflow-scrolling: touch; }
        .modal-footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; justify-content: flex-end; }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { transform: scale(.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

        @media (max-width: 640px) {
          .modal-backdrop {
            padding: 0;
            align-items: flex-end;
          }
          .modal-content {
            max-width: 100% !important;
            border-radius: 22px 22px 0 0;
            max-height: 92vh;
            animation: slideUp .22s cubic-bezier(.16, 1, .3, 1);
            padding-bottom: env(safe-area-inset-bottom);
          }
          .modal-grip {
            display: block;
            width: 44px; height: 4px;
            background: rgba(15,23,42,.18);
            border-radius: 999px;
            margin: 10px auto 0;
            flex-shrink: 0;
          }
          .modal-header {
            padding: 10px 18px 14px;
          }
          .modal-body { padding: 16px 18px; }
          .modal-footer {
            padding: 12px 16px max(14px, env(safe-area-inset-bottom));
            position: sticky; bottom: 0; background: var(--bg-card);
          }
          .modal-footer button { min-height: 44px; flex: 1; }
        }
      `}</style>
    </div>
  );
}
