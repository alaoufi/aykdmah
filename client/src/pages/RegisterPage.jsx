import { localizedTerms } from '../utils/localizeTerms';
import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import usePublicSettings from '../hooks/usePublicSettings';
import { sendPhoneCode, checkPhone, changeAccountType } from '../services/authService';
import { createSupport } from '../services/supportService';
import { cleanPhone, cleanTyped, isSaudiMobile } from '../utils/saudiPhone';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import ProfessionsPicker from '../components/common/ProfessionsPicker';
import DevicePermissions from '../components/common/DevicePermissions';
import SignupIntro, { signupIntroSeen } from '../components/common/SignupIntro';
import SafeHtml from '../components/common/SafeHtml';
import { apiError } from '../services/api';
import { internalAuthReturn, authReturnTarget } from '../utils/authReturn';
import ProblemNotice from '../components/common/ProblemNotice';
import { keptInvite, forgetInvite } from '../utils/invite';

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { register, user, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const from = internalAuthReturn(location.state?.from);
  // From «سجّل كمقدم خدمة» links: «مقدم خدمة» is chosen already after sign-up.
  const [wantsProvider] = useState(() => ['provider', 'both'].includes(params.get('role')) || location.state?.wantsProvider === true);
  const { settings } = usePublicSettings();
  const termsHtml = localizedTerms(settings, lang, t);

  // AYK-411 (the owner: «لا تجتهد إلا بتسهيل وتبسيط»): first opening asks the language only;
  // then the phone and password, a code to the phone, and the account is ready and signed in.
  const [intro, setIntro] = useState(() => !signupIntroSeen());
  const [form, setForm] = useState({
    // AYK-372: from «للتسجيل من هنا» on the sign-in page, the number already typed there.
    phone: typeof location.state?.identifier === 'string' && /^[\d+\s()-]{8,}$/.test(location.state.identifier.trim()) ? cleanTyped(location.state.identifier.trim()) : '',
    password: '',
  });
  // A shared invitation link (?ref=CODE, or aykdmh.com/i/CODE kept on this device) still counts, silently.
  const [referralCode] = useState(() => (params.get('ref') || keptInvite() || '').trim().toUpperCase().slice(0, 12));
  const [termsOpen, setTermsOpen] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  // '' | 'checking' | 'available' | 'taken' — checked when the phone field loses focus.
  const [phoneStatus, setPhoneStatus] = useState('');
  const [loading, setLoading] = useState(false);
  // Router state survives the session-keyed route remount after registration.
  const receipt = location.state?.registrationResult;
  const welcome = receipt?.userId && receipt.userId === user?.id ? receipt : null;
  useEffect(() => {
    if (welcome) window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [welcome]);
  // Phone code step: shown only when an SMS provider is active (AYK-016).
  const [codeStep, setCodeStep] = useState(null);
  const [phoneCode, setPhoneCode] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  const submission = useRef(false);

  // After sign-up: «طالب خدمة» ends here; «مقدم خدمة» picks professions or writes a missing one.
  const [choice, setChoice] = useState(() => (wantsProvider ? 'provider' : ''));
  const [serviceIds, setServiceIds] = useState([]);
  const [ownProfession, setOwnProfession] = useState('');
  const [saving, setSaving] = useState(false);
  const [providerError, setProviderError] = useState('');

  const update = (key, value) => {
    if (key === 'phone') { setCodeStep(null); setPhoneCode(''); setPhoneStatus(''); }
    setForm(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => { const { [key]: _removed, ...rest } = previous; return rest; });
    setError('');
  };

  const verifyPhone = async () => {
    const value = cleanPhone(form.phone);
    if (!value) return;
    if (!isSaudiMobile(value)) { setFieldErrors(previous => ({ ...previous, phone: t('auth.phone_invalid') })); return; }
    setPhoneStatus('checking');
    try {
      const result = await checkPhone(value);
      if (result?.available === false) {
        setPhoneStatus('taken');
        setFieldErrors(previous => ({ ...previous, phone: t('auth.phone_registered') }));
      } else setPhoneStatus(result?.valid ? 'available' : '');
    } catch (_) { setPhoneStatus(''); }
  };

  const formErrors = () => {
    const errors = {};
    const phone = cleanPhone(form.phone);
    if (!isSaudiMobile(phone)) errors.phone = t('auth.phone_invalid');
    else if (phoneStatus === 'taken') errors.phone = t('auth.phone_registered');
    if (form.password.length < 4) errors.password = t('auth.password_min');
    if (codeStep && phoneCode.length < codeStep.length) errors.code = t('auth.code_required');
    return errors;
  };
  const pending = Object.values(formErrors());
  const canSubmit = pending.length === 0 && phoneStatus !== 'checking';

  const handleSubmit = async event => {
    event.preventDefault();
    if (submission.current || welcome) return;
    const phone = cleanPhone(form.phone);
    const errors = formErrors();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError(Object.values(errors)[0]);
      return;
    }
    submission.current = true;
    setLoading(true);
    setError('');
    if (!codeStep) {
      try {
        const sent = await sendPhoneCode(phone, 'signup');
        if (sent?.required) {
          setCodeStep({ length: sent.length || 4 });
          setWait(sent.resend_seconds || 60);
          setLoading(false);
          submission.current = false;
          return;
        }
      } catch (err) {
        setError(apiError(err));
        if ([400, 409].includes(err.response?.status)) setFieldErrors({ phone: apiError(err) });
        setLoading(false);
        submission.current = false;
        return;
      }
    }
    try {
      const res = await register({
        ...(codeStep ? { phone_code: phoneCode } : {}),
        onboarding_version: 2, role: 'client', phone, password: form.password,
        terms_accepted: true, terms_version: settings.terms_version || '1.0',
        ...(referralCode ? { referral_code: referralCode } : {}),
      });
      if (!res?.user?.role) throw new Error('Invalid registration response');
      forgetInvite(); // used: the next sign-up on this device starts clean
      navigate('/register', { replace: true, state: { from, wantsProvider, registrationResult: { userId: res.user.id, role: res.user.role } } });
    } catch (err) {
      setError(err.response?.data?.message === 'coupon_not_found' ? t('auth.invite_not_found') : apiError(err));
      if (err.response?.status === 409) setFieldErrors({ phone: apiError(err) });
    } finally { submission.current = false; setLoading(false); }
  };

  if (welcome) {
    const own = ownProfession.trim();
    const canFinish = serviceIds.length > 0 || own.length >= 2;
    const finishProvider = async () => {
      if (!canFinish || saving) return;
      setSaving(true); setProviderError('');
      try {
        await changeAccountType({ role: 'provider', quick: true, service_ids: serviceIds, ...(own.length >= 2 ? { suggested_profession: own } : {}) });
        if (own.length >= 2) await createSupport('suggestion', t('auth.own_profession_message', { name: own })).catch(() => {});
        await refresh();
        navigate(authReturnTarget('provider', from), { replace: true });
      } catch (err) {
        setProviderError(apiError(err));
      } finally { setSaving(false); }
    };
    return (
      <div className="space-y-3" data-testid="register-welcome">
        <div role="status" className="rounded-card border border-success/30 bg-success-soft px-4 py-3 text-success text-center font-bold">
          ✓ {t('auth.registration_success')}
        </div>
        <h2 className="m-0 text-center">{t('auth.who_are_you')}</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('auth.who_are_you')}>
          <button type="button" role="radio" aria-checked={choice === 'client'} data-testid="register-continue-client"
            onClick={() => navigate(authReturnTarget('client', from), { replace: true })}
            className="min-h-[64px] rounded-card border-2 border-border bg-surface font-extrabold text-[16px] hover:border-primary">🙋 {t('auth.role_client')}</button>
          <button type="button" role="radio" aria-checked={choice === 'provider'} data-testid="register-become-provider"
            onClick={() => setChoice('provider')}
            className={`min-h-[64px] rounded-card border-2 font-extrabold text-[16px] ${choice === 'provider' ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-surface hover:border-primary'}`}>🛠️ {t('auth.role_provider')}</button>
        </div>

        {choice === 'provider' && <div className="space-y-3" data-testid="register-provider-step">
          <ProfessionsPicker serviceIds={serviceIds} onChange={ids => { setServiceIds(ids); setProviderError(''); }} />
          <Input id="register-own-profession" label={t('auth.own_profession_label')} maxLength={80}
            value={ownProfession} onChange={e => { setOwnProfession(e.target.value); setProviderError(''); }} data-testid="register-own-profession" />
          {providerError && <ProblemNotice error={providerError} />}
          <Button type="button" block variant="primary" loading={saving} disabled={!canFinish} onClick={finishProvider} data-testid="register-provider-send">
            {t('auth.own_profession_send')}
          </Button>
        </div>}

        {/* Microphone/camera and notifications are asked for here, once (AYK-047). */}
        <DevicePermissions />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} data-testid="register-form" noValidate>
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0 space-y-3">
        <h2 className="mb-0">{t('auth.register_title')}</h2>

        {error && <ProblemNotice error={error} />}

        <Input id="register-phone" name="phone" label={t('auth.phone')} type="tel" required maxLength={30} dir="ltr"
          value={form.phone} error={fieldErrors.phone} autoComplete="tel" inputMode="tel" placeholder="05XXXXXXXX"
          hint={phoneStatus === 'available' ? t('auth.phone_available') : phoneStatus === 'checking' ? '…' : undefined}
          onBlur={verifyPhone} onChange={e => update('phone', cleanTyped(e.target.value))} />
        {phoneStatus === 'taken' && (
          <div className="flex gap-4 text-[13px] -mt-2">
            <Link to="/login" state={{ identifier: cleanPhone(form.phone) }} className="text-primary font-semibold">{t('auth.login_button')}</Link>
            <Link to="/forgot-password" state={{ identifier: cleanPhone(form.phone) }} className="text-primary font-semibold">{t('auth.forgot_password')}</Link>
          </div>
        )}
        <PasswordInput label={t('auth.password')} required minLength={4} autoComplete="new-password" adviseLength
          hint={t('auth.password_min')} value={form.password} error={fieldErrors.password} onChange={e => update('password', e.target.value)} />

        {codeStep && <div className="rounded-card border-2 border-primary px-3 py-2 space-y-2" data-testid="register-code">
          <p className="text-[13px] m-0">{t('auth.code_sent_to', { phone: form.phone })}</p>
          <Input id="register-code" label={t('auth.verification_code')} dir="ltr" inputMode="numeric" autoComplete="one-time-code" autoFocus
            maxLength={codeStep.length} placeholder={'1234567890'.slice(0, codeStep.length)} value={phoneCode}
            className="text-center tracking-[.5em] font-mono" onChange={e => { setPhoneCode(cleanPhone(e.target.value).replace(/\D/g, '')); setError(''); }} />
          <div className="flex justify-between text-[13px]">
            <button type="button" className="text-primary font-semibold" onClick={() => { setCodeStep(null); setPhoneCode(''); document.getElementById('register-phone')?.focus(); }}>{t('auth.change_phone')}</button>
            <button type="button" className="text-primary font-semibold disabled:opacity-50" disabled={wait > 0 || loading}
              onClick={async () => { try { const sent = await sendPhoneCode(cleanPhone(form.phone), 'signup'); setWait(sent?.resend_seconds || 60); setError(''); } catch (err) { setError(apiError(err)); } }}>
              {wait > 0 ? t('auth.resend_in', { seconds: wait }) : t('auth.resend_code')}
            </button>
          </div>
        </div>}

        <Button type="submit" data-testid="register-submit" block loading={loading} variant="primary" disabled={!canSubmit}>
          {codeStep ? t('auth.code_confirm') : t('auth.send_code_button')}
        </Button>

        {/* No checkbox to tick: creating the account accepts the terms (AYK-044). */}
        <p className="text-center text-[12px] text-fg-muted m-0" data-testid="register-terms">
          {t('auth.terms_by_signup')}{' '}
          <button type="button" onClick={() => setTermsOpen(true)} className="text-primary font-semibold underline underline-offset-2">{t('auth.terms_link')}</button>
        </p>

        <div className="text-center text-sm text-secondary">
          {t('auth.have_account')} <Link to="/login" state={{ from, ...(form.phone ? { identifier: form.phone } : {}) }}>{t('auth.login_title')}</Link>
        </div>
      </fieldset>

      {termsOpen && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => setTermsOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface rounded-card border border-border w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-extrabold text-ink text-[16px]">{t('auth.terms_title')}</h3>
              <button type="button" onClick={() => setTermsOpen(false)} className="w-8 h-8 rounded-full hover:bg-surface-alt text-fg-muted text-xl leading-none">×</button>
            </div>
            <SafeHtml className="overflow-y-auto p-4 text-[13.5px] leading-[1.85] text-ink" html={termsHtml || t('auth.terms_fallback')} />
            <div className="border-t border-border px-4 py-3 flex justify-end">
              <button type="button" onClick={() => setTermsOpen(false)}
                className="px-4 py-2 rounded-pill bg-primary text-primary-fg text-[13px] font-bold">✓ {t('auth.terms_accept')}</button>
            </div>
          </div>
        </div>
      )}

      <SignupIntro open={intro} startWithLanguage languageOnly onClose={() => setIntro(false)} />
    </form>
  );
}
