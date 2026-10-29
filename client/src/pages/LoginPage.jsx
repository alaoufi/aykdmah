import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import { apiError } from '../services/api';
import { sendPhoneCode } from '../services/authService';
import { cleanPhone, isSaudiMobile } from '../utils/saudiPhone';
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
  // Requesters have no password: they sign in with a code sent to the phone (AYK-041).
  const [mode, setMode] = useState('code');
  const [codeSent, setCodeSent] = useState(null);
  const [code, setCode] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'code' && !codeSent) {
      const phone = cleanPhone(form.identifier);
      if (!isSaudiMobile(phone)) { setError(t('auth.phone_invalid')); return; }
      setLoading(true);
      try {
        const sent = await sendPhoneCode(phone, 'login');
        if (!sent?.required) { setMode('password'); setError(t('requester.code_unavailable')); }
        else setCodeSent({ phone, length: sent.length || 4 });
      } catch (err) {
        setError(apiError(err));
        if (err.response?.status === 503) setMode('password');
      } finally { setLoading(false); }
      return;
    }
    setLoading(true);
    try {
      const res = await login(mode === 'code' ? { identifier: codeSent.phone, phone_code: code } : form);
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
        label={mode === 'code' ? t('auth.phone') : t('auth.identifier')}
        hint={mode === 'code' ? undefined : t('auth.identifier_hint')}
        required
        autoComplete={mode === 'code' ? 'tel' : 'username'}
        inputMode={mode === 'code' ? 'tel' : undefined}
        dir={mode === 'code' ? 'ltr' : undefined}
        placeholder={mode === 'code' ? '05XXXXXXXX' : undefined}
        value={form.identifier}
        onChange={(e) => { setForm({ ...form, identifier: e.target.value }); setCodeSent(null); setCode(''); }}
      />
      {mode === 'code' ? <>
        {codeSent && <Input label={t('auth.verification_code')} dir="ltr" inputMode="numeric" autoComplete="one-time-code" autoFocus required
          maxLength={codeSent.length} value={code} className="text-center tracking-[.5em] font-mono" data-testid="login-code"
          hint={t('auth.code_sent_to', { phone: codeSent.phone })}
          onChange={(e) => setCode(cleanPhone(e.target.value).replace(/\D/g, ''))} />}
        <Button type="submit" block loading={loading} variant="primary" data-testid="login-code-submit">
          {codeSent ? t('auth.login_button') : t('requester.send_code')}
        </Button>
        <div className="text-center mt-3">
          <button type="button" className="text-[13px] font-semibold text-primary" onClick={() => { setMode('password'); setError(''); }}>{t('requester.login_with_password')}</button>
        </div>
      </> : <>
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
      <div className="text-center mt-3">
        <button type="button" className="text-[13px] font-semibold text-primary" onClick={() => { setMode('code'); setError(''); }}>{t('requester.login_with_code')}</button>
      </div>
      </>}

      <div className="text-center mt-4 text-sm text-secondary">
        {t('auth.no_account')} <Link to="/register" state={{ from }}>{t('auth.create_account')}</Link>
      </div>
    </form>
  );
}
