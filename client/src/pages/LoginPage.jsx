import { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import { apiError } from '../services/api';
import { internalAuthReturn, authReturnTarget, isRequestAuthReturn } from '../utils/authReturn';
import ProblemNotice from '../components/common/ProblemNotice';
import { cleanTyped } from '../utils/saudiPhone';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = internalAuthReturn(location.state?.from);
  // AYK-327: while the person types, fetch the pages sign-in leads to, so they open at once.
  useEffect(() => {
    const timer = setTimeout(() => {
      import('./client/MyRequestsPage').catch(() => {});
      import('./provider/ProviderDashboardPage').catch(() => {});
      import('./HomePage').catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const [wrongPassword, setWrongPassword] = useState(false);
  const [form, setForm] = useState({ identifier: typeof location.state?.identifier === 'string' ? location.state.identifier : '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true); setWrongPassword(false);
    try {
      const res = await login(form);
      // The admin signs in at /admin only (AYK-114).
      if (res.user.role === 'admin') {
        await logout();
        setError(t('auth.admin_use_panel'));
        return;
      }
      navigate(authReturnTarget(res.user.role, from), { replace: true });
    } catch (err) {
      // AYK-208: locked after 5 wrong passwords: reset with an SMS code (the same password is allowed).
      if (err?.response?.status === 423) {
        navigate('/forgot-password', { state: { identifier: form.identifier, notice: apiError(err) } });
        return;
      }
      // AYK-369 (the owner): a wrong password says only that, with «استعادة كلمة المرور»; no support box.
      // AYK-372: not registered → «للتسجيل من هنا»; a wrong password → «لاستعادتها من هنا».
      if (err?.response?.status === 401 && !form.phone_code) {
        setError(''); setWrongPassword(err.response.data?.code === 'account_not_found' ? 'unknown' : 'password'); return;
      }
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="mb-1">{t('auth.login_title')}</h2>
      <p className="text-secondary text-sm mb-4">{t('auth.welcome_back')}</p>
      {isRequestAuthReturn(from) && <p role="status" className="text-sm text-secondary mb-3">{t('auth.request_signin_hint')}</p>}

      {location.state?.notice && !error && <div role="status" className="mb-3 px-3 py-2 rounded-card bg-success-soft text-success text-[13px] font-semibold">✓ {location.state.notice}</div>}
      {error && <ProblemNotice error={error} />}
      {wrongPassword && !error && (
        <div role="alert" className="mb-3 px-3 py-2.5 rounded-card bg-danger-soft text-danger text-[14px] font-semibold flex items-center justify-between gap-2 flex-wrap" data-testid="wrong-password">
          {wrongPassword === 'unknown' ? (<>
            <span>{t(/^[\d+\s()-]+$/.test(form.identifier.trim()) ? 'auth.phone_not_registered' : 'auth.account_not_registered')}</span>
            <Link to="/register" state={{ from, identifier: form.identifier }} className="text-primary underline" data-testid="register-here">{t('auth.register_here')}</Link>
          </>) : (<>
            <span>{t('auth.wrong_password')}</span>
            <Link to="/forgot-password" state={{ identifier: form.identifier }} className="text-primary underline" data-testid="recover-here">{t('auth.recover_here')}</Link>
          </>)}
        </div>
      )}

      <Input
        label={t('auth.identifier')}
        hint={t('auth.identifier_hint')}
        required
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={form.identifier}
        onChange={(e) => setForm({ ...form, identifier: cleanTyped(e.target.value) })}
      />
      <PasswordInput
        label={t('auth.password')}
        required
        autoComplete="current-password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <Button type="submit" block loading={loading} variant="primary">{t('auth.login_button')}</Button>

      {/* AYK-411: «نسيت كلمة المرور» in the middle, and creating an account plainly under it. */}
      <div className="text-center mt-3">
        <Link to="/forgot-password" state={{ identifier: form.identifier }} className="text-[14px] font-semibold">{t('auth.forgot_password')}</Link>
      </div>
      <Link to="/register" state={{ from }} data-testid="login-create-account"
        className="mt-3 flex items-center justify-center min-h-[48px] rounded-card border-2 border-primary text-primary font-extrabold text-[15px] no-underline">
        {t('auth.create_account')}
      </Link>
    </form>
  );
}
