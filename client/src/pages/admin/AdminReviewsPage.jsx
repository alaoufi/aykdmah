import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  listReviewsAdmin, hideReview, showReview, deleteReview,
} from '../../services/adminService';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import { formatRelativeTime } from '../../utils/formatters';
import { apiError } from '../../services/api';

export default function AdminReviewsPage() {
  const { t } = useTranslation();
  const TABS = [
    { value: '',        label: t('common.all') },
    { value: 'visible', label: t('admin.is_active') },
    { value: 'hidden',  label: t('admin.review_hidden') },
  ];

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState('');
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState({ open: false });
  const [error, setError] = useState('');
  const loadVersion = useRef(0);
  const visibilityInFlight = useRef(new Set());

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    listReviewsAdmin({ visibility, page, limit: 20 })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [visibility, page]);

  const toggleVisibility = async (r) => {
    if (visibilityInFlight.current.has(r.id)) return;
    visibilityInFlight.current.add(r.id);
    try {
      if (r.is_visible) await hideReview(r.id);
      else await showReview(r.id);
      load();
    } catch (e) { setError(apiError(e)); }
    finally { visibilityInFlight.current.delete(r.id); }
  };

  const askDelete = (r) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: t('admin.confirm_delete_body'),
      tone: 'danger',
      onConfirm: async () => {
        await deleteReview(r.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.reviews')} count={meta?.pagination?.total} />

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 flex flex-wrap gap-2 shadow-soft">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setVisibility(tab.value); setPage(1); }}
            className={`px-4 py-2 rounded-pill text-[13px] font-semibold transition border ${
              visibility === tab.value
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
            <div key={i} className="h-[140px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100"><EmptyState icon="⭐" title={t('admin.no_results')} /></div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className={`bg-white rounded-card border p-4 shadow-soft ${r.is_visible ? 'border-slate-100' : 'border-rose-200 bg-rose-50/30'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-3">
                  <div className="text-amber-500 font-bold text-[15px]">
                    {'★'.repeat(Math.max(0, Math.min(5, Number(r.rating) || 0)))}
                    <span className="text-slate-300">{'★'.repeat(5 - Math.max(0, Math.min(5, Number(r.rating) || 0)))}</span>
                  </div>
                  <div>
                    <div className="text-[13px] font-bold text-ink">{r.reviewer_name || '—'}</div>
                    <div className="text-[11.5px] text-slate-500">
                      {t('admin.review_provider')}: {r.provider_name || '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!r.is_visible && (
                    <span className="px-2 py-0.5 rounded-pill bg-rose-50 text-rose-600 text-[10.5px] font-bold">{t('admin.review_hidden')}</span>
                  )}
                  <span className="text-[10.5px] text-slate-400">{formatRelativeTime(r.created_at)}</span>
                </div>
              </div>
              {r.request_title && (
                <div className="text-[11.5px] text-slate-500 mb-1">{r.request_title}</div>
              )}
              {r.comment && (
                <p className="text-[13px] text-slate-700 leading-relaxed mb-3">{r.comment}</p>
              )}
              {r.provider_reply && (
                <div className="text-[12.5px] text-slate-600 px-3 py-2 rounded-card bg-slate-50 border-s-4 border-brand-300 mb-3">
                  <span className="text-slate-400">↩ </span>{r.provider_reply}
                </div>
              )}
              <div className="flex gap-1.5 pt-2 border-t border-slate-100">
                <button onClick={() => toggleVisibility(r)} className={`px-3 py-1 rounded-pill text-[11.5px] font-semibold transition ${
                  r.is_visible ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}>
                  {r.is_visible ? t('admin.hide_review') : t('admin.show_review')}
                </button>
                <button onClick={() => askDelete(r)} className="px-3 py-1 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
                  {t('admin.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {meta?.pagination && meta.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-card border border-slate-100 p-4 shadow-soft">
          <span className="text-[12.5px] text-slate-500">{meta.pagination.page} / {meta.pagination.totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={!meta.pagination.hasPrev}
              className="px-4 py-2 rounded-pill text-[12px] font-semibold bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition">
              {t('common.previous')}
            </button>
            <button onClick={() => setPage((p) => p + 1)} disabled={!meta.pagination.hasNext}
              className="px-4 py-2 rounded-pill text-[12px] font-semibold text-white shadow-soft disabled:opacity-40 transition"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
              {t('common.next')}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}
