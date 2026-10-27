import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listActivityLogs } from '../../services/adminService';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import { formatRelativeTime } from '../../utils/formatters';
import { apiError } from '../../services/api';

export default function AdminActivityLogsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    listActivityLogs({ page, limit: 50 })
      .then((res) => { if (active) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (active) { setItems([]); setMeta(null); setError(apiError(e)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.activity_logs')} count={meta?.pagination?.total} />

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="text-right text-[11.5px] font-bold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 py-3">{t('admin.log_user')}</th>
                <th className="py-3">{t('admin.log_action')}</th>
                <th className="py-3">{t('admin.log_target')}</th>
                <th className="py-3">{t('admin.log_ip')}</th>
                <th className="py-3 px-5">{t('admin.log_when')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td colSpan="5" className="py-3 px-5">
                      <div className="h-10 bg-slate-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan="5"><EmptyState icon="📜" title={t('admin.no_results')} /></td></tr>
              ) : (
                items.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3 text-[13px] font-semibold text-ink">{l.full_name || '—'}</td>
                    <td className="py-3 text-[12.5px] text-slate-700">
                      <span className="inline-flex px-2 py-0.5 rounded-pill bg-brand-50 text-brand-700 font-bold text-[11px]">{l.action}</span>
                    </td>
                    <td className="py-3 text-[12px] text-slate-600">
                      {l.target_type || '—'}{l.target_id ? ` #${l.target_id}` : ''}
                    </td>
                    <td className="py-3 text-[11.5px] text-slate-500 font-mono">{l.ip_address || '—'}</td>
                    <td className="py-3 px-5 text-[11.5px] text-slate-400">{formatRelativeTime(l.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta?.pagination && meta.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-slate-100">
            <span className="text-[12.5px] text-slate-500">
              {meta.pagination.page} / {meta.pagination.totalPages}
            </span>
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
      </div>
    </div>
  );
}
