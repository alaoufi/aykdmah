import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import { sendPhoneCode, resetPassword } from '../services/authService';
import { apiError } from '../services/api';

// "Forgot password": a code to the registered phone, then a new password (AYK-016).
export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const initial = typeof location.state?.identifier === 'string' && /^[+\d\s()-]+$/.test(location.state.identifier) ? location.state.identifier : '';
  const [phone, setPhone] = useState(initial);
  const [step, setStep] = useState('phone');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [length, setLength] = useState(4);
  const [wait, setWait] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async () => {
    const normalized = phone.trim().replace(/[\s()-]/g, '');
    if (!/^\+?\d{8,15}$/.test(normalized)) { setError(t('auth.account_phone_required')); return; }
    setLoading(true); setError('');
    try {
      const result = await sendPhoneCode(normalized, 'reset');
      setLength(result?.length || 4);
      setWait(result?.resend_seconds || 60);
      setStep('code');
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  };

  const submit = async event => {
    event.preventDefault();
    if (step === 'phone') { await send(); return; }
    if (code.length < length) { setError(t('auth.code_required')); return; }
    if (password.length < 4) { setError(t('auth.password_min')); return; }
    setLoading(true); setError('');
    try {
      await resetPassword({ phone: phone.trim().replace(/[\s()-]/g, ''), code, password });
      navigate('/login', { replace: true, state: { identifier: phone.trim(), notice: t('auth.reset_done') } });
    } catch (err) { setError(apiError(err)); }
    finally { setLoading(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <h2 className="mb-0">{t('auth.forgot_title')}</h2>
      <p className="text-sm text-secondary">{step === 'phone' ? t('auth.forgot_hint') : t('auth.code_sent_to', { phone })}</p>
      {error && <div role="alert" className="form-error" style={{ background: 'rgba(239,68,68,.1)', padding: 8, borderRadius: 8 }}>{error}</div>}

      <Input id="forgot-phone" label={t('auth.phone')} type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="05XXXXXXXX"
        value={phone} disabled={step === 'code'} onChange={e => { setPhone(e.target.value); setError(''); }} />

      {step === 'code' && <>
        <Input id="forgot-code" label={t('auth.verification_code')} dir="ltr" inputMode="numeric" autoComplete="one-time-code"
          maxLength={length} placeholder={'1234567890'.slice(0, length)} value={code}
          className="text-center tracking-[.5em] font-mono" onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError(''); }} />
        <PasswordInput label={t('auth.new_password')} minLength={4} autoComplete="new-password" value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }} />
        <div className="flex justify-between text-[13px]">
          <button type="button" className="text-primary font-semibold" onClick={() => { setStep('phone'); setCode(''); }}>{t('auth.change_phone')}</button>
          <button type="button" className="text-primary font-semibold disabled:opacity-50" disabled={wait > 0 || loading} onClick={send}>
            {wait > 0 ? t('auth.resend_in', { seconds: wait }) : t('auth.resend_code')}
          </button>
        </div>
      </>}

      <Button type="submit" block variant="primary" loading={loading}>{step === 'phone' ? t('auth.send_code') : t('auth.reset_button')}</Button>
      <div className="text-center text-sm text-secondary"><Link to="/login">{t('auth.back_to_login')}</Link></div>
    </form>
  );
}
