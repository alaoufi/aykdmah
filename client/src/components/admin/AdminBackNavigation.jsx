import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { adminBackTarget } from '../../utils/adminBackTarget';

const AdminBackContext = createContext(null);
export function AdminBackProvider({ children }) {
  const [handler, setHandler] = useState(null);
  return <AdminBackContext.Provider value={{ handler, setHandler }}>{children}</AdminBackContext.Provider>;
}
export function useAdminBack(handler) {
  const context = useContext(AdminBackContext);
  const latest = useRef(handler);
  latest.current = handler;
  const active = Boolean(handler);
  const setter = context?.setHandler;
  useEffect(() => {
    if (!setter || !active) return;
    setter(() => () => latest.current?.());
    return () => setter(null);
  }, [setter, active]);
}
export function AdminBackButton() {
  const { t, i18n } = useTranslation();
  const context = useContext(AdminBackContext);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  if (!context?.handler && pathname === '/admin') return null;
  const back = context?.handler || (() => navigate(adminBackTarget(window.history.state)));
  return <button type="button" onClick={back} aria-label={t('common.back')}
    className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-pill bg-surface-alt hover:bg-border text-fg-muted text-[13px] font-semibold">
    <span aria-hidden="true">{i18n.dir() === 'rtl' ? '→' : '←'}</span><span>{t('common.back')}</span>
  </button>;
}
