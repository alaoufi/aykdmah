import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { changePassword } from '../../services/authService';
import { apiError } from '../../services/api';
import PasswordInput from '../../components/common/PasswordInput';
import Button from '../../components/common/Button';
import ProblemNotice from '../../components/common/ProblemNotice';

const CHANGED_KEY = 'ayk_admin_password_changed';

// The admin area's own password page (AYK-272). The admin session is separate from the site's
// (AYK-114/151), so a generated password (the bootstrap admin, or reset-admin-password.js) is
// replaced here; until then every other admin page leads back to this one (utils/passwordGate.js).
export default function AdminPasswordPage() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const mustChange = Number(user?.must_change_password) === 1;
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  // The new session reloads the account and this page, so the notice waits for it.
  const [msg, setMsg] = useState(() => {
    try {
      if (!sessionStorage.getItem(CHANGED_KEY)) return '';
      sessionStorage.removeItem(CHANGED_KEY);
      return t('profile.password_changed_here');
    } catch (_) { return ''; }
  });

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setErr(''); setMsg(''); setSaving(true);
    try {
      await changePassword(pw);
      setPw({ current_password: '', new_password: '' });
      try { sessionStorage.setItem(CHANGED_KEY, '1'); } catch (_) { /* private mode */ }
      setMsg(t('profile.password_changed_here'));
      await refresh();
    } catch (e2) { setErr(apiError(e2)); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4" data-testid="admin-password-page">
      <h1 className="text-2xl font-extrabold">🔑 {t('profile.change_password')}</h1>
      {mustChange && (
        <div role="alert" className="px-3 py-2.5 rounded-card bg-amber-50 text-amber-800 border border-amber-200 text-[13px]" data-testid="admin-must-change-password">
          {t('profile.must_change_password')}
        </div>
      )}
      {msg && (
        <div className="space-y-3">
          <div className="badge badge-success" role="status" data-testid="admin-password-changed">{msg}</div>
          {!mustChange && <div><Link to="/admin" className="btn btn-primary no-underline">{t('admin.dashboard')}</Link></div>}
        </div>
      )}
      {err && <ProblemNotice error={err} onClose={() => setErr('')} />}
      <form onSubmit={save} className="card" data-testid="admin-change-password-form">
        <PasswordInput label={t('profile.current_password')} required autoComplete="current-password"
          value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} />
        <PasswordInput label={t('profile.new_password')} name="new_password" required minLength={4} autoComplete="new-password" adviseLength
          value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} />
        <Button type="submit" variant="primary" disabled={saving}>{t('profile.change_password_save')}</Button>
      </form>
    </div>
  );
}
