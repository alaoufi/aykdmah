import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import {
  getStatus, startMethod, confirmMethod, startNafath, pollNafath,
} from '../services/verificationService';
import { apiError } from '../services/api';
import { LoadingState } from '../components/common/Spinner';

const METHOD_META = {
  sms:      { icon: '📱', titleKey: 'verify.method_sms',      hintKey: 'verify.hint_sms' },
  whatsapp: { icon: '💬', titleKey: 'verify.method_whatsapp', hintKey: 'verify.hint_whatsapp' },
  email:    { icon: '✉️', titleKey: 'verify.method_email',    hintKey: 'verify.hint_email' },
  nafath:   { icon: '🆔', titleKey: 'verify.method_nafath',   hintKey: 'verify.hint_nafath' },
};

function MethodCard({ method, status, onAction, busy }) {
  const { t } = useTranslation();
  const meta = METHOD_META[method];
  const verified = status?.status === 'verified';
  return (
    <div className="bg-surface border border-border rounded-card p-4 md:p-5 shadow-soft flex items-start gap-4">
      <div className="w-12 h-12 rounded-card bg-primary-soft grid place-items-center text-2xl shrink-0">{meta.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-extrabold text-fg text-[15px]">{t(meta.titleKey)}</h3>
          {verified ? (
            <span className="px-2 py-0.5 rounded-pill bg-success-soft text-success text-[10.5px] font-bold">
              ✓ {t('verify.verified')}
            </span>
          ) : status?.status === 'pending' ? (
            <span className="px-2 py-0.5 rounded-pill bg-warning-soft text-warning text-[10.5px] font-bold">
              … {t('verify.pending')}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-pill bg-surface-alt text-fg-subtle text-[10.5px] font-bold">
              {t('verify.not_started')}
            </span>
          )}
        </div>
        <p className="text-fg-muted text-[13px] mb-3">{t(meta.hintKey)}</p>
        {status?.identifier && (
          <div className="text-[11.5px] text-fg-subtle mb-2 font-mono">{status.identifier}</div>
        )}
        {!verified && (
          <button
            onClick={onAction}
            disabled={busy}
            className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-bold bg-primary-grad disabled:opacity-60"
          >
            {busy ? t('common.loading') : t('verify.start')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeMethod, setActiveMethod] = useState(null);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [nafathInfo, setNafathInfo] = useState(null);

  const load = () => {
    setLoading(true);
    getStatus().then(setData).catch(error => setError(apiError(error))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openMethod = (method) => {
    if (busy || !METHOD_META[method]) return;
    setActiveMethod(method);
    setError(''); setSuccess(''); setOtpSent(false); setCode(''); setNafathInfo(null);
    if (method === 'email') setIdentifier(user.email || '');
    else if (method === 'nafath') setIdentifier('');
    else setIdentifier(user.phone || '');
  };

  const handleStart = async () => {
    if (busy || !METHOD_META[activeMethod]) return;
    setError(''); setBusy(true);
    try {
      if (activeMethod === 'nafath') {
        const res = await startNafath(identifier);
        setNafathInfo(res);
        setSuccess(t('verify.nafath_started', { code: res.code }));
      } else {
        await startMethod(activeMethod, identifier);
        setOtpSent(true);
        setSuccess(t('verify.code_sent'));
      }
    } catch (err) {
      setError(apiError(err));
    } finally { setBusy(false); }
  };

  const handleConfirm = async () => {
    if (busy || !METHOD_META[activeMethod]) return;
    setError(''); setBusy(true);
    try {
      if (activeMethod === 'nafath') {
        const res = await pollNafath(nafathInfo.transactionId);
        if (res.verified) {
          setSuccess(t('verify.verified_done'));
          setActiveMethod(null);
          load();
        } else {
          setError(t('verify.nafath_pending'));
        }
      } else {
        await confirmMethod(activeMethod, code);
        setSuccess(t('verify.verified_done'));
        setActiveMethod(null);
        load();
      }
    } catch (err) {
      setError(apiError(err));
    } finally { setBusy(false); }
  };

  if (loading) return <LoadingState />;

  const policy = data?.policy;
  const status = data?.status || {};
  const enabled = Array.isArray(policy?.enabled) ? policy.enabled.filter(method => METHOD_META[method]) : [];
  const required = user?.role === 'provider' ? policy?.required_for_provider : policy?.required_for_client;

  return (
    <div className="container page max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-fg text-2xl md:text-3xl font-extrabold">{t('verify.title')}</h1>
        <p className="text-fg-muted mt-1">{t('verify.subtitle')}</p>
        {required && required.length > 0 && (
          <div className="mt-3 p-3 rounded-card bg-warning-soft border border-warning/30 text-[13px] text-warning">
            <strong>{t('verify.required_methods')}: </strong>
            {required.join(', ')}
          </div>
        )}
      </div>

      {success && (
        <div className="mb-4 px-4 py-3 rounded-card bg-success-soft border border-success/30 text-success text-sm">{success}</div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-card bg-danger-soft border border-danger/30 text-danger text-sm">{error}</div>
      )}

      <div className="space-y-3">
        {enabled.map((m) => (
          <MethodCard
            key={m}
            method={m}
            status={status[m]}
            busy={busy}
            onAction={() => openMethod(m)}
          />
        ))}
        {enabled.length === 0 && (
          <div className="bg-surface border border-border rounded-card p-6 text-center text-fg-muted">
            {t('verify.none_enabled')}
          </div>
        )}
      </div>

      {/* Inline drawer for the active method */}
      {activeMethod && (
        <div className="mt-6 bg-surface border border-primary/40 rounded-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-fg">
              {METHOD_META[activeMethod].icon} {t(METHOD_META[activeMethod].titleKey)}
            </h3>
            <button disabled={busy} onClick={() => setActiveMethod(null)} className="text-fg-subtle hover:text-fg">✕</button>
          </div>

          {!otpSent && !nafathInfo && (
            <div className="space-y-3">
              <label className="block text-[12.5px] font-bold text-fg">
                {activeMethod === 'email' ? t('verify.field_email')
                 : activeMethod === 'nafath' ? t('verify.field_national_id')
                 : t('verify.field_phone')}
              </label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={activeMethod === 'nafath' ? '1XXXXXXXXX' : ''}
                className="w-full px-3 py-2.5 rounded-card border border-border bg-surface-alt focus:bg-surface focus:border-primary outline-none text-[14px]"
              />
              <button
                onClick={handleStart}
                disabled={busy || !identifier}
                className="w-full px-4 py-2.5 rounded-pill text-primary-fg text-[14px] font-bold bg-primary-grad disabled:opacity-60"
              >
                {busy ? t('common.loading') : t('verify.send_code')}
              </button>
            </div>
          )}

          {otpSent && (
            <div className="space-y-3">
              <label className="block text-[12.5px] font-bold text-fg">{t('verify.enter_code')}</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                className="w-full px-3 py-3 rounded-card border border-border bg-surface-alt focus:bg-surface focus:border-primary outline-none text-center text-[22px] tracking-[8px] font-mono"
              />
              <div className="flex gap-2">
                <button onClick={handleConfirm} disabled={busy || code.length < 4}
                  className="flex-1 px-4 py-2.5 rounded-pill text-primary-fg text-[14px] font-bold bg-primary-grad disabled:opacity-60">
                  {t('verify.confirm')}
                </button>
                <button disabled={busy} onClick={() => { setOtpSent(false); setCode(''); }}
                  className="px-4 py-2.5 rounded-pill bg-surface-alt text-fg-muted text-[13px] font-semibold">
                  {t('verify.resend')}
                </button>
              </div>
            </div>
          )}

          {nafathInfo && (
            <div className="space-y-3">
              <div className="text-center py-4 bg-primary-soft rounded-card">
                <div className="text-[11px] text-fg-muted mb-1">{t('verify.nafath_match_code')}</div>
                <div className="text-[36px] font-extrabold text-primary tracking-wider">{nafathInfo.code}</div>
              </div>
              <p className="text-[13px] text-fg-muted text-center">{t('verify.nafath_instructions')}</p>
              <button onClick={handleConfirm} disabled={busy}
                className="w-full px-4 py-2.5 rounded-pill text-primary-fg text-[14px] font-bold bg-primary-grad disabled:opacity-60">
                {busy ? t('common.loading') : t('verify.check_status')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
