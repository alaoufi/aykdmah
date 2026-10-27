import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  listAllRequests, assignRequest, cancelRequest, deleteRequest, listUsers,
} from '../../services/adminService';
import { REQUEST_STATUS } from '../../utils/constants';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { IconSearch } from '../../components/common/Icons';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import EmptyState from '../../components/admin/EmptyState';
import { apiError } from '../../services/api';

const STATUS_BADGE = {
  'badge-primary': 'bg-brand-50 text-brand-700',
  'badge-warning': 'bg-amber-50 text-amber-700',
  'badge-success': 'bg-emerald-50 text-emerald-700',
  'badge-danger': 'bg-rose-50 text-rose-700',
  'badge': 'bg-slate-100 text-slate-600',
};

export default function AdminRequestsPage() {
  const { t } = useTranslation();

  const STATUS_TABS = useMemo(() => [
    { value: '',            label: t('common.all') },
    { value: 'open',        label: t('status.request.open') },
    { value: 'assigned',    label: t('status.request.assigned') },
    { value: 'in_progress', label: t('status.request.in_progress') },
    { value: 'completed',   label: t('status.request.completed') },
    { value: 'cancelled',   label: t('status.request.cancelled') },
  ], [t]);

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [page, setPage] = useState(1);

  const [assignFor, setAssignFor] = useState(null);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState({ open: false });
  const [error, setError] = useState('');
  const [providersLoading, setProvidersLoading] = useState(false);
  const loadVersion = useRef(0);
  const assignVersion = useRef(0);
  const assignInFlight = useRef(false);

  const load = () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    listAllRequests({ status, search, page, limit: 20 })
      .then((res) => { if (version === loadVersion.current) { setItems(res.data || []); setMeta(res.meta); } })
      .catch((e) => { if (version === loadVersion.current) { setItems([]); setMeta(null); setError(apiError(e)); } })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, search, page]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchValue);
  };

  const openAssign = async (req) => {
    const version = ++assignVersion.current;
    setAssignFor(req);
    setSelectedProvider(''); setProviders([]); setProvidersLoading(true); setError('');
    try {
      const res = await listUsers({ role: 'provider', limit: 100 });
      if (version !== assignVersion.current) return;
      setProviders(res.data || []);
    } catch (e) { if (version === assignVersion.current) { setProviders([]); setError(apiError(e)); } }
    finally { if (version === assignVersion.current) setProvidersLoading(false); }
  };

  const closeAssign = () => { ++assignVersion.current; setAssignFor(null); setSelectedProvider(''); setProviders([]); };

  const submitAssign = async () => {
    if (!assignFor || !selectedProvider || providersLoading || assignInFlight.current) return;
    const version = assignVersion.current;
    const requestId = assignFor.id;
    assignInFlight.current = true;
    setBusy(true);
    try {
      await assignRequest(requestId, selectedProvider);
      if (version !== assignVersion.current) return;
      closeAssign();
      load();
    } catch (e) { if (version === assignVersion.current) setError(apiError(e)); }
    finally { assignInFlight.current = false; setBusy(false); }
  };

  const askCancel = (req) => {
    setConfirm({
      open: true,
      title: t('admin.cancel_request'),
      body: req.title,
      tone: 'warning',
      onConfirm: async () => {
        await cancelRequest(req.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  const askDelete = (req) => {
    setConfirm({
      open: true,
      title: t('admin.confirm_delete_title'),
      body: `${t('admin.confirm_delete_body')} (${req.title})`,
      tone: 'danger',
      onConfirm: async () => {
        await deleteRequest(req.id);
        setConfirm({ open: false });
        load();
      },
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.requests')} count={meta?.pagination?.total} />

      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}

      <div className="bg-white rounded-card border border-slate-100 p-4 md:p-5 flex flex-wrap items-center gap-3 shadow-soft">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => { setStatus(tab.value); setPage(1); }}
              className={`shrink-0 px-4 py-2 rounded-pill text-[13px] font-semibold transition border ${
                status === tab.value
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form onSubmit={onSearch} className="flex-1 min-w-[200px] md:max-w-[320px] md:ms-auto relative">
          <span className="absolute inset-y-0 right-3 grid place-items-center text-slate-400 pointer-events-none">
            <IconSearch size={16} />
          </span>
          <input
            type="text"
            placeholder={t('common.search')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full pr-9 pl-3 py-2.5 rounded-pill border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[13.5px]"
          />
        </form>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[170px] rounded-card bg-white border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-card border border-slate-100">
          <EmptyState icon="📋" title={t('admin.no_results')} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((r) => {
            const info = REQUEST_STATUS[r.status] || { color: 'badge' };
            const infoLabel = info.i18nKey ? t(info.i18nKey) : r.status;
            const canAssign = r.status === 'open';
            const canCancel = ['open', 'assigned', 'in_progress'].includes(r.status);
            return (
              <div key={r.id} className="bg-white rounded-card border border-slate-100 p-5 hover:border-brand-300 hover:shadow-card transition">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.is_urgent && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-rose-50 text-rose-600 text-[10.5px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        {t('admin.is_urgent')}
                      </span>
                    )}
                    <span className={`inline-flex px-2.5 py-0.5 rounded-pill text-[10.5px] font-bold ${STATUS_BADGE[info.color] || STATUS_BADGE['badge']}`}>
                      {infoLabel}
                    </span>
                  </div>
                  <span className="text-[10.5px] text-slate-400">{formatRelativeTime(r.created_at)}</span>
                </div>
                <Link to={`/requests/${r.id}`} className="block no-underline">
                  <h3 className="text-[15px] font-extrabold text-ink mb-1 line-clamp-1 hover:text-brand-700">{r.title}</h3>
                  <p className="text-[12.5px] text-slate-500 leading-relaxed line-clamp-2 mb-3">{r.description}</p>
                </Link>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-[12px]">
                  <div className="text-slate-600">
                    <span className="text-slate-400">{t('auth.role_client')}: </span>
                    <span className="font-semibold text-ink">{r.client_name || '—'}</span>
                  </div>
                  <div className="text-slate-600">
                    {r.budget_min && (
                      <>
                        <span className="text-slate-400">{t('request.budget')}: </span>
                        <span className="font-bold text-brand-700">{formatCurrency(r.budget_min)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-slate-100">
                  {canAssign && (
                    <button onClick={() => openAssign(r)} className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-brand-50 text-brand-700 hover:bg-brand-100 transition">
                      {t('admin.assign_request')}
                    </button>
                  )}
                  {canCancel && (
                    <button onClick={() => askCancel(r)} className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 transition">
                      {t('admin.cancel_request')}
                    </button>
                  )}
                  <button onClick={() => askDelete(r)} className="px-3 py-1.5 rounded-pill text-[11.5px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
                    {t('admin.delete')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {meta?.pagination && meta.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-card border border-slate-100 p-4 shadow-soft">
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

      <Modal
        open={!!assignFor}
        onClose={closeAssign}
        title={t('admin.assign_request')}
        footer={
          <>
            <button onClick={closeAssign} className="px-4 py-2 rounded-pill bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-semibold border border-slate-200 transition">
              {t('admin.cancel_btn')}
            </button>
            <button onClick={submitAssign} disabled={busy || providersLoading || !selectedProvider} className="px-4 py-2 rounded-pill text-white text-[13px] font-semibold shadow-soft disabled:opacity-60 transition" style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
              {busy ? t('admin.saving') : t('admin.confirm_action')}
            </button>
          </>
        }
      >
        {assignFor && (
          <div className="space-y-3">
            {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}
            <div className="text-[13px] text-slate-600">{assignFor.title}</div>
            <label className="block text-[12px] font-bold text-ink">{t('admin.select_provider')}</label>
            <select
              disabled={providersLoading || busy}
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full px-3 py-2 rounded-card border border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500 outline-none text-[14px]"
            >
              <option value="">—</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} — {p.email}
                </option>
              ))}
            </select>
          </div>
        )}
      </Modal>

      <ConfirmDialog {...confirm} onCancel={() => setConfirm({ open: false })} />
    </div>
  );
}
