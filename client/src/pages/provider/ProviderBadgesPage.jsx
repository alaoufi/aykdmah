import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMyBadges, requestBadge, payBadge, cancelBadge } from '../../services/badgeService';
import { formatCurrency } from '../../utils/formatters';
import { LoadingState } from '../../components/common/Spinner';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { apiError } from '../../services/api';

const BADGE_META = {
  trusted:  { icon: '🛡️', tone: 'bg-emerald-50 border-emerald-300 text-emerald-700' },
  featured: { icon: '⭐', tone: 'bg-amber-50 border-amber-300 text-amber-700' },
};

const STATUS_BADGE = {
  requested:        'bg-blue-50 text-blue-700',
  approved:         'bg-emerald-50 text-emerald-700',
  awaiting_payment: 'bg-amber-50 text-amber-700',
  active:           'bg-emerald-100 text-emerald-800',
  rejected:         'bg-rose-50 text-rose-700',
  expired:          'bg-slate-100 text-slate-600',
  cancelled:        'bg-slate-100 text-slate-500',
};

export default function ProviderBadgesPage() {
  const { t } = useTranslation();
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]   = useState(null);
  const [msg, setMsg]     = useState(null);
  const [confirm, setConfirm] = useState({ open: false });

  const load = () => {
    setLoading(true);
    getMyBadges().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  if (loading) return <LoadingState />;
  if (!data) return <p role="alert" className="form-error">{t('errors.generic')}</p>;
  const { config, badges } = data;

  const openFor = (type) => badges.find((b) =>
    b.badge_type === type &&
    ['requested', 'approved', 'awaiting_payment', 'active'].includes(b.status)
  );

  const ask = (type) => {
    const cfg = config[type];
    const total = Number(cfg.monthly_fee) + (cfg.insurance_required ? Number(cfg.insurance_amount) : 0);
    setConfirm({
      open: true,
      title: t('badge.confirm_request_title'),
      body: (
        <div className="space-y-2 text-[13.5px]">
          <div className="flex items-center gap-2">{BADGE_META[type].icon} <b>{t(`badge.${type}_name`)}</b></div>
          <div>{t('badge.monthly_fee')}: <b>{formatCurrency(cfg.monthly_fee)}</b></div>
          {cfg.insurance_required && (
            <div>{t('badge.insurance')}: <b>{formatCurrency(cfg.insurance_amount)}</b> <span className="text-slate-500 text-[11.5px]">({t('badge.insurance_refundable')})</span></div>
          )}
          <div className="pt-2 border-t border-slate-200">
            {t('badge.total_due_after_approval')}: <b>{formatCurrency(total)}</b>
          </div>
          <p className="text-[12px] text-slate-500">{t('badge.workflow_hint')}</p>
        </div>
      ),
      tone: 'primary',
      onConfirm: async () => {
        setBusy(type);
        try {
          await requestBadge({ badge_type: type });
          setMsg({ type: 'success', text: t('badge.request_sent') });
          load();
        } catch (e) {
          setMsg({ type: 'error', text: apiError(e) });
        } finally {
          setBusy(null);
          setConfirm({ open: false });
        }
      },
    });
  };

  const onPay = async (b) => {
    setBusy(b.id);
    try {
      await payBadge(b.id);
      setMsg({ type: 'success', text: t('badge.activated') });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: apiError(e) });
    } finally { setBusy(null); }
  };

  const onCancel = (b) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: t('badge.confirm_cancel_body'),
      tone: 'danger',
      onConfirm: async () => {
        setBusy(b.id);
        try {
          await cancelBadge(b.id);
          load();
        } catch (e) {
          setMsg({ type: 'error', text: apiError(e) });
        } finally {
          setBusy(null);
          setConfirm({ open: false });
        }
      },
    });
  };

  if (!config.enabled) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        <h1 className="text-[20px] font-extrabold text-ink">{t('badge.page_title')}</h1>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-card">
          {t('badge.disabled_notice')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div>
        <h1 className="text-[20px] font-extrabold text-ink">{t('badge.page_title')}</h1>
        <p className="text-slate-500 text-[13px] mt-1">{t('badge.page_hint')}</p>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['trusted', 'featured'].map((type) => {
          const cfg  = config[type];
          const open = openFor(type);
          const meta = BADGE_META[type];
          return (
            <div key={type} className={`rounded-card border-2 p-5 shadow-soft ${meta.tone}`}>
              <div className="flex items-start gap-3">
                <span className="text-4xl">{meta.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-[16px]">{t(`badge.${type}_name`)}</div>
                  <p className="text-[12.5px] mt-1 opacity-80">{t(`badge.${type}_desc`)}</p>
                </div>
              </div>

              <div className="mt-4 bg-white/60 rounded-card p-3 space-y-1.5">
                <Row label={t('badge.monthly_fee')} value={formatCurrency(cfg.monthly_fee)} bold />
                {cfg.insurance_required && (
                  <Row label={t('badge.insurance')}  value={`${formatCurrency(cfg.insurance_amount)} • ${t('badge.refundable')}`} />
                )}
              </div>

              {open ? (
                <BadgeStateCard b={open} t={t} busy={busy} onPay={onPay} onCancel={onCancel} />
              ) : (
                <button
                  onClick={() => ask(type)}
                  disabled={busy === type}
                  className="mt-4 w-full px-4 py-3 rounded-pill bg-white text-ink font-bold shadow-soft hover:shadow-lift transition disabled:opacity-60"
                >
                  ✨ {t('badge.request_button')}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Past history (rejected / expired / cancelled) */}
      {badges.some((b) => !['requested', 'approved', 'awaiting_payment', 'active'].includes(b.status)) && (
        <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 font-extrabold text-[14px] text-ink">
            {t('badge.history_title')}
          </div>
          <ul className="divide-y divide-slate-100">
            {badges
              .filter((b) => !['requested', 'approved', 'awaiting_payment', 'active'].includes(b.status))
              .map((b) => (
                <li key={b.id} className="px-5 py-3 flex items-center gap-3 text-[13px]">
                  <span className="text-xl">{BADGE_META[b.badge_type].icon}</span>
                  <span className="flex-1">{t(`badge.${b.badge_type}_name`)}</span>
                  <span className={`px-2 py-0.5 rounded-pill text-[11px] font-bold ${STATUS_BADGE[b.status]}`}>
                    {t(`badge.status_${b.status}`)}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}

function Row({ label, value, bold }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="opacity-75">{label}</span>
      <span className={bold ? 'font-extrabold' : 'font-semibold'}>{value}</span>
    </div>
  );
}

function BadgeStateCard({ b, t, busy, onPay, onCancel }) {
  const status = b.status;
  return (
    <div className="mt-4 bg-white/80 rounded-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] opacity-70">{t('badge.current_status')}</span>
        <span className={`px-2.5 py-0.5 rounded-pill text-[11.5px] font-bold ${STATUS_BADGE[status]}`}>
          {t(`badge.status_${status}`)}
        </span>
      </div>

      {status === 'requested' && (
        <p className="text-[12.5px] opacity-80">{t('badge.requested_hint')}</p>
      )}
      {status === 'approved' && (
        <>
          <p className="text-[12.5px] opacity-80">{t('badge.approved_hint')}</p>
          <button
            onClick={() => onPay(b)} disabled={busy === b.id}
            className="w-full px-4 py-2.5 rounded-pill text-white font-bold shadow-soft hover:shadow-lift transition disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
          >
            💳 {busy === b.id ? t('admin.saving') : t('badge.pay_now')}
          </button>
        </>
      )}
      {status === 'active' && b.ends_at && (
        <p className="text-[12px] opacity-75">
          {t('badge.active_until', { date: new Date(b.ends_at).toLocaleDateString() })}
        </p>
      )}

      {['requested', 'approved'].includes(status) && (
        <button
          onClick={() => onCancel(b)} disabled={busy === b.id}
          className="w-full px-4 py-2 rounded-pill bg-white text-rose-700 border border-rose-200 hover:bg-rose-50 text-[12.5px] font-semibold transition disabled:opacity-60"
        >
          {t('admin.cancel_btn')}
        </button>
      )}
    </div>
  );
}
