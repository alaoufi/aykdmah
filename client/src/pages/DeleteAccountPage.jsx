import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { apiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';

// Deleting one's own account (AYK-116), the web address Google Play asks for: what is erased,
// what is kept, then the password and a confirmation.
export default function DeleteAccountPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [jobs, setJobs] = useState([]);
  const done = location.state?.accountDeleted === true && (!user || user.id === location.state?.deletedAccountId);
  const submission = useRef(false);

  const submit = async e => {
    e.preventDefault();
    if (submission.current || done || !sure || !password) return;
    submission.current = true;
    setBusy(true); setProblem(''); setJobs([]);
    try {
      const { data } = await api.post('/users/me/delete', { password });
      if (data?.success !== true || data?.data?.deleted !== true) throw new Error('Invalid deletion response');
      // Keep the confirmed receipt when logout remounts the session subtree.
      navigate('/delete-account', { replace: true, state: { accountDeleted: true, deletedAccountId: user.id } });
      setPassword('');
      await logout().catch(() => {});
    } catch (err) {
      setProblem(apiError(err));
      setJobs(err?.response?.data?.errors?.jobs || []);
    } finally { submission.current = false; setBusy(false); }
  };

  return (
    <article className="max-w-xl mx-auto px-4 py-10" data-testid="delete-account">
      <h1 className="text-2xl font-extrabold text-fg mb-2">🗑️ {t('account_delete.title')}</h1>
      {done ? <div role="status" className="card bg-success-soft text-success text-center py-8">
        <div aria-hidden="true" className="text-4xl mb-3">✓</div>
        <h2 className="text-xl font-bold m-0">{t('account_delete.done')}</h2>
        <Link to="/" className="inline-block mt-4 font-bold underline">{t('nav.home')}</Link>
      </div> : <>
        <div className="card mb-4 text-[14px] leading-relaxed">
          <p className="font-bold text-danger m-0 mb-1">{t('account_delete.erased_title')}</p>
          <p className="m-0 mb-3">{t('account_delete.erased')}</p>
          <p className="font-bold m-0 mb-1">{t('account_delete.kept_title')}</p>
          <p className="m-0">{t('account_delete.kept')}</p>
        </div>
        {!user ? (
          <p className="card text-[14px]">{t('account_delete.sign_in_first')} <Link to="/login" className="font-bold text-primary">{t('nav.login')}</Link>
            <br />{t('account_delete.or_email')} <a href="mailto:support@aykdmh.com" dir="ltr">support@aykdmh.com</a></p>
        ) : (
          <form onSubmit={submit} className="card space-y-3">
            <p className="m-0 text-[14px]">{t('account_delete.signed_as')} <b>{user.full_name}</b> <span dir="ltr">({user.referral_code})</span></p>
            <label className="block text-[14px] font-semibold">{t('account_delete.password')}
              <input type="password" className="input mt-1 w-full" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" data-testid="delete-password" />
            </label>
            <label className="flex items-center gap-2 text-[14px] cursor-pointer">
              <input type="checkbox" className="w-4 h-4" checked={sure} onChange={e => setSure(e.target.checked)} data-testid="delete-sure" />
              {t('account_delete.confirm')}
            </label>
            {problem && <div role="alert" className="form-error">{problem}
              {jobs.length > 0 && <ul className="mt-1 mb-0">{jobs.map(j => <li key={j.id}><Link to={`/requests/${j.id}`}>{j.title}</Link></li>)}</ul>}</div>}
            <button type="submit" className="btn btn-danger w-full" disabled={busy || !sure || !password} data-testid="delete-submit">
              {busy ? '⏳' : `🗑️ ${t('account_delete.submit')}`}</button>
          </form>
        )}
      </>}
    </article>
  );
}
