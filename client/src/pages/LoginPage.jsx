import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import { apiError } from '../services/api';
import { internalAuthReturn, authReturnTarget, isRequestAuthReturn } from '../utils/authReturn';

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = internalAuthReturn(location.state?.from);

  const [form, setForm] = useState({ identifier: typeof location.state?.identifier === 'string' ? location.state.identifier : '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(form);
      navigate(authReturnTarget(res.user.role, from), { replace: true });
    } catch (err) {
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
      {error && <div className="form-error mb-3" style={{ background: 'rgba(239,68,68,.1)', padding: 10, borderRadius: 8 }}>{error}</div>}

      <Input
        label={t('auth.identifier')}
        hint={t('auth.identifier_hint')}
        required
        autoComplete="username"
        value={form.identifier}
        onChange={(e) => setForm({ ...form, identifier: e.target.value })}
      />
      <PasswordInput
        label={t('auth.password')}
        required
        autoComplete="current-password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <div className="text-end -mt-1 mb-3">
        <Link to="/forgot-password" state={{ identifier: form.identifier }} className="text-[13px] font-semibold">{t('auth.forgot_password')}</Link>
      </div>

      <Button type="submit" block loading={loading} variant="primary">{t('auth.login_button')}</Button>

      <div className="text-center mt-4 text-sm text-secondary">
        {t('auth.no_account')} <Link to="/register" state={{ from }}>{t('auth.create_account')}</Link>
      </div>
    </form>
  );
}
