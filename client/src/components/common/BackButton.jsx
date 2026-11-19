import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Universal back button. Uses history when available, otherwise sends
// the user to a sensible default (home for public pages, the admin
// dashboard for /admin/*). Hidden on root pages where there is nothing
// to return to.
//
// Direction-aware: the arrow always points "back" — visually toward the
// inline-start edge — regardless of LTR/RTL.

const ROOT_PATHS = new Set(['/', '/admin', '/client', '/provider']);

export default function BackButton({ className = '', fallback, hideOnRoot = true }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rtl = (i18n.dir(i18n.resolvedLanguage) || document.documentElement.dir) === 'rtl';

  if (hideOnRoot && ROOT_PATHS.has(pathname)) return null;

  const handleBack = () => {
    // history.length > 1 means the user navigated into the page;
    // otherwise (e.g. opened a deep link directly) go to a default.
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(fallback || (pathname.startsWith('/admin') ? '/admin' : '/'));
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={t('common.back')}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-pill bg-surface-alt hover:bg-border text-fg-muted hover:text-fg text-[13px] font-semibold transition ${className}`}
    >
      {/* Arrow points toward the inline-start edge (left in LTR,
          right in RTL) — always the direction the eye reads "back". */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           xmlns="http://www.w3.org/2000/svg" aria-hidden="true"
           style={{ transform: rtl ? 'scaleX(-1)' : 'none' }}>
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="hidden sm:inline">{t('common.back')}</span>
    </button>
  );
}
