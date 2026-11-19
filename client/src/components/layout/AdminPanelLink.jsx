import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import api, { ADMIN_TOKEN_KEY, getToken } from '../../services/api';
import { showProblem } from '../common/AppDialog';

// One sign-in, like Trbhh and Jadati (AYK-202): an account with admin rights sees «لوحة الإدارة» in
// its menu and opens it without signing in again. The admin area still keeps its own session
// underneath (AYK-151), so phone notifications and the site session are untouched.
export default function AdminPanelLink({ className = '', onDone }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!Number(user?.admin_account)) return null;

  const open = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { data } = await api.post('/auth/admin-session', null, {
        headers: { 'X-Ayk-Scope': 'admin', Authorization: `Bearer ${getToken()}` },
      });
      try { localStorage.setItem(ADMIN_TOKEN_KEY, data.data.token); } catch (_) { /* private mode: sign in at /admin */ }
      onDone?.();
      window.location.assign('/admin');
    } catch (err) {
      setBusy(false);
      showProblem(err);
    }
  };

  return (
    <button type="button" onClick={open} disabled={busy} className={className} data-testid="open-admin-panel">
      🛡️ {busy ? t('admin.saving') : t('nav.admin')}
    </button>
  );
}
