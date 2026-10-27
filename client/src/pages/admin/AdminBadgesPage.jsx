import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { adminListBadges, adminApproveBadge, adminRejectBadge } from '../../services/badgeService';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Avatar from '../../components/common/Avatar';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { apiError } from '../../services/api';

const TYPE_META = {
  trusted:  { icon: '🛡️', color: 'bg-emerald-50 text-emerald-700' },
  featured: { icon: '⭐', color: 'bg-amber-50 text-amber-700' },
};

const STATUS_COLOR = {
  requested:        'bg-blue-50 text-blue-700',
  approved:         'bg-emerald-50 text-emerald-700',
  awaiting_payment: 'bg-amber-50 text-amber-700',
  active:           'bg-emerald-100 text-emerald-800',
  rejected:         'bg-rose-50 text-rose-700',
  expired:          'bg-slate-100 text-slate-600',
  cancelled:        'bg-slate-100 text-slate-500',
};

const STATUS_TABS = [
  { value: '',          labelKey: 'common.all' },
  { value: 'requested', labelKey: 'badge.status_requested' },
  { value: 'approved',  labelKey: 'badge.status_approved' },
  { value: 'active',    labelKey: 'badge.status_active' },
  { value: 'rejected',  labelKey: 'badge.status_rejected' },
];

export default function AdminBadgesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [meta, setMeta]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('requested');
  const [page, setPage]     = useState(1);
  const [msg, setMsg]       = useState(null);
  const [confirm, setConfirm] = useState({ open: false });
  const loadVersion = useRef(0);

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true);
    adminListBadges({ status, page, limit: 20 })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setMsg({ type: 'error', text: apiError(e) }); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, page]);

  const onApprove = (b) => {
    setConfirm({
      open: true,
      title: t('badge.confirm_approve_title'),
      body: `${t(`badge.${b.badge_type}_name`)} • ${b.user_name}`,
      tone: 'primary',
      onConfirm: async () => {
        try {
          await adminApproveBadge(b.id);
          setMsg({ type: 'success', text: t('badge.approved_msg') });
          load();
        } catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
        finally { setConfirm({ open: false }); }
      },
    });
  };

  const onReject = (b) => {
    const reason = window.prompt(t('badge.reject_reason_prompt'), '');
    if (reason === null) return;
    setConfirm({
      open: true,
      title: t('badge.confirm_reject_title'),
      body: `${t(`badge.${b.badge_type}_name`)} • ${b.user_name}`,
      tone: 'danger',
      onConfirm: async () => {
        try {
          await adminRejectBadge(b.id, reason);
          setMsg({ type: 'success', text: t('badge.rejected_msg') });
          load();
        } catch (e) { setMsg({ type: 'error', text: apiError(e) }); }
        finally { setConfirm({ open: false }); }
      },
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.badges')} count={meta?.pagination?.total} />

      {msg && (
        <div className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      <div className="bg-white rounded-card border border-slate-100 p-3 shadow-soft">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {STATUS_TABS.map((tab) => (
            <button key={tab.value}
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className={`shrink-0 px-4 py-2 rounded-pill text-[13px] font-semibold transition border ${
                status === tab.value
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
              }`}
            >{t(tab.labelKey)}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[110px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="🛡️" title={t('admin.no_results')} /></div>
      ) : (
        <div className="space-y-3">
          {items.map((b) => {
            const tm = TYPE_META[b.badge_type] || {};
            const total = Number(b.monthly_fee) + Number(b.insurance_amount || 0);
            return (
              <div key={b.id} className="bg-white rounded-card border border-slate-100 p-4 shadow-soft">
                <div className="flex items-start gap-3">
                  <Avatar src={b.user_avatar} name={b.user_name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-pill text-[11.5px] font-bold ${tm.color}`}>{tm.icon} {t(`badge.${b.badge_type}_name`)}</span>
                      <span className={`px-2 py-0.5 rounded-pill text-[11.5px] font-bold ${STATUS_COLOR[b.status]}`}>{t(`badge.status_${b.status}`)}</span>
                    </div>
                    <div className="font-extrabold text-ink text-[14.5px] mt-1">{b.user_name}</div>
                    <div className="text-[12px] text-slate-500 mt-0.5 flex items-center gap-3 flex-wrap">
                      <span>{t('badge.monthly_fee')}: <b>{formatCurrency(b.monthly_fee)}</b></span>
                      {b.insurance_required ? <span>{t('badge.insurance')}: <b>{formatCurrency(b.insurance_amount)}</b></span> : null}
                      <span className="text-slate-400">• {formatRelativeTime(b.created_at)}</span>
                    </div>
                    {b.notes && <div className="mt-2 text-[12.5px] bg-slate-50 rounded p-2 text-slate-700">«{b.notes}»</div>}
                    {b.rejection_reason && <div className="mt-2 text-[12.5px] bg-rose-50 rounded p-2 text-rose-700">{t('badge.reason')}: {b.rejection_reason}</div>}
                    {b.status === 'active' && b.ends_at && (
                      <div className="mt-2 text-[12px] text-emerald-700 font-semibold">{t('badge.active_until', { date: new Date(b.ends_at).toLocaleDateString() })}</div>
                    )}
                  </div>
                  <div className="text-end shrink-0">
                    <div className="text-[12px] text-slate-400">{t('badge.total')}</div>
                    <div className="text-[18px] font-extrabold text-ink">{formatCurrency(total)}</div>
                  </div>
                </div>

                {b.status === 'requested' && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex gap-2">
                    <button onClick={() => onApprove(b)} className="flex-1 px-3 py-2 rounded-pill bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[12.5px] font-semibold transition">
                      ✓ {t('badge.approve')}
                    </button>
                    <button onClick={() => onReject(b)} className="flex-1 px-3 py-2 rounded-pill bg-rose-50 text-rose-700 hover:bg-rose-100 text-[12.5px] font-semibold transition">
                      ✗ {t('badge.reject')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {meta?.pagination && meta.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-card border border-slate-100 p-3">
          <span className="text-[12.5px] text-slate-500">{meta.pagination.page} / {meta.pagination.totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!meta.pagination.hasPrev}
              className="px-4 py-2 rounded-pill text-[12px] font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-40">{t('common.previous')}</button>
            <button onClick={() => setPage((p) => p + 1)} disabled={!meta.pagination.hasNext}
              className="px-4 py-2 rounded-pill text-[12px] font-semibold text-white shadow-soft disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>{t('common.next')}</button>
          </div>
        </div>
      )}

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}
