import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listMyRequests, deleteRequest } from '../../services/requestService';
import { apiError } from '../../services/api';
import RequestCard from '../../components/requests/RequestCard';
import { LoadingState, EmptyState } from '../../components/common/Spinner';

export default function MyRequestsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  // Two tabs (AYK-075): active requests and the archive of finished ones.
  const [params, setParams] = useSearchParams();
  const scope = params.get('tab') === 'archive' ? 'archive' : 'active';
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [problem, setProblem] = useState('');
  const navigate = useNavigate();
  // Clear actions under each request (AYK-044): stop it (with "I found the provider"
  // and a rating) or delete it.
  const remove = async request => {
    if (!window.confirm(t('requester.delete_confirm', { title: request.title }))) return;
    setProblem('');
    try { await deleteRequest(request.id); setReload(value => value + 1); } catch (err) { setProblem(apiError(err)); }
  };

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    listMyRequests({ scope, limit: 50 })
      .then(res => { if (current) setItems(res.data || []); })
      .catch(() => { if (current) { setItems([]); setError(true); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [scope, reload]);

  const tabs = [
    { value: 'active', label: `🟢 ${t('manage.active')}` },
    { value: 'archive', label: `🗄️ ${t('manage.archive')}` },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="m-0">📋 {t('requester.manage_title')}</h2>
          <p className="text-[13px] text-fg-muted mt-1 mb-0">{t('requester.manage_hint')}</p>
        </div>
        <Link to="/requests/new" className="btn btn-primary">➕ {t('home.new_request')}</Link>
      </div>

      <div className="status-tabs mb-4">
        {tabs.map(s => (
          <button key={s.value} type="button" data-testid={`tab-${s.value}`} className={scope === s.value ? 'active' : ''} onClick={() => setParams(s.value === 'archive' ? { tab: 'archive' } : {}, { replace: true })}>
            {s.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="form-error">{t('errors.generic')}</p>}
      {problem && <p role="alert" className="form-error">{problem}</p>}

      {loading ? <LoadingState /> :
       items.length === 0 ? <EmptyState title={t('common.none')} /> :
       <div className="grid grid-2">{items.map(r => (
         <div key={r.id} className="flex flex-col gap-2" data-testid="managed-request">
           <RequestCard request={r} />
           {['open', 'assigned', 'in_progress'].includes(r.status) && (
             <div className="flex gap-2 flex-wrap">
               {r.status === 'open' && <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/requests/${r.id}#close`)} data-testid="manage-stop">⏹ {t('requester.stop_request')}</button>}
               {r.status !== 'open' && <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate(`/requests/${r.id}`)}>✅ {t('request.complete')}</button>}
               {r.status === 'open' && <button type="button" className="btn btn-outline btn-sm text-danger" onClick={() => remove(r)} data-testid="manage-delete">🗑 {t('requester.delete_request')}</button>}
             </div>
           )}
           {r.status === 'completed' && <Link to={`/requests/${r.id}/review`} className="text-[13px] font-semibold text-primary">⭐ {t('review.rate_provider')}</Link>}
         </div>
       ))}</div>}

      <style>{`
        .status-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
        .status-tabs button {
          padding: 8px 16px; border: 1px solid var(--border); background: var(--bg-card);
          border-radius: 999px; cursor: pointer; white-space: nowrap; font: inherit; color: var(--text-secondary);
        }
        .status-tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
      `}</style>
    </div>
  );
}
