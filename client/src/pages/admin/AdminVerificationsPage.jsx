import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listVerifications, reviewVerification } from '../../services/adminService';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import { formatRelativeTime } from '../../utils/formatters';
import { apiError } from '../../services/api';

export default function AdminVerificationsPage() {
  const { t } = useTranslation();
  const TABS = [
    { value: 'pending',  label: t('admin.verification_pending'),  badge: 'bg-amber-50 text-amber-700' },
    { value: 'approved', label: t('admin.verification_approved'), badge: 'bg-emerald-50 text-emerald-700' },
    { value: 'rejected', label: t('admin.verification_rejected'), badge: 'bg-rose-50 text-rose-700' },
  ];

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState({ open: false });
  const [statusTab, setStatusTab] = useState('pending');
  const [page, setPage] = useState(1);
  const [rejectFor, setRejectFor] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadVersion = useRef(0);
  const actionInFlight = useRef(false);

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    listVerifications({ status: statusTab, page, limit: 20 })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusTab, page]);

  const approve = async (v) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    try { await reviewVerification(v.id, 'approve'); load(); }
    catch (e) { setError(apiError(e)); }
    finally { actionInFlight.current = false; setBusy(false); }
  };

  const reject = async () => {
    if (!rejectFor || actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    try {
      await reviewVerification(rejectFor.id, 'reject', reason);
      setRejectFor(null); setReason('');
      load();
    } catch (e) { setError(apiError(e)); }
    finally { actionInFlight.current = false; setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.verifications')} count={meta?.pagination?.total} />

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 flex flex-wrap gap-2 shadow-soft">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusTab(tab.value); setPage(1); }}
            className={`px-4 py-2 rounded-pill text-[13px] font-semibold transition border ${
              statusTab === tab.value
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-[120px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="🛡️" title={t('admin.no_results')} /></div>
      ) : (
        <div className="space-y-3">
          {items.map((v) => (
            <div key={v.id} className="bg-white rounded-card border border-slate-100 p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-extrabold text-ink text-[15px]">{v.full_name}</div>
                  <div className="text-[12.5px] text-slate-500">{v.email} · {v.phone || '—'}</div>
                </div>
                <span className="text-[11px] text-slate-400">{formatRelativeTime(v.created_at)}</span>
              </div>
              {v.id_number && (
                <div className="text-[12.5px] text-slate-600 mb-2">
                  <span className="text-slate-400">{v.id_type || 'ID'}: </span>
                  <span className="font-semibold text-ink">{v.id_number}</span>
                </div>
              )}
              {v.rejection_reason && statusTab === 'rejected' && (
                <div className="mt-2 px-3 py-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-[12.5px]">
                  {v.rejection_reason}
                </div>
              )}
              {statusTab === 'pending' && (
                <div className="flex gap-2 mt-3">
                  <button onClick={() => approve(v)} disabled={busy}
                    className="px-4 py-1.5 rounded-pill text-[12px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 transition">
                    ✓ {t('admin.verification_approve')}
                  </button>
                  <button onClick={() => { setRejectFor(v); setReason(''); }} disabled={busy}
                    className="px-4 py-1.5 rounded-pill text-[12px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-60 transition">
                    ✕ {t('admin.verification_reject')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!rejectFor}
        onClose={() => setRejectFor(null)}
        title={t('admin.verification_reject')}
        footer={
          <>
            <button onClick={() => setRejectFor(null)} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200">{t('admin.cancel_btn')}</button>
            <button onClick={reject} disabled={busy} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold bg-rose-600 hover:bg-rose-700 disabled:opacity-60 transition">{busy ? t('admin.saving') : t('admin.verification_reject')}</button>
          </>
        }
      >
        <div className="space-y-2">
          {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}
          <label className="block text-[12px] font-bold text-ink">{t('admin.rejection_reason')}</label>
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]" />
        </div>
      </Modal>
      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}
