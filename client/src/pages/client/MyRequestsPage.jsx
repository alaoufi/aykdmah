import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listMyRequests } from '../../services/requestService';
import RequestCard from '../../components/requests/RequestCard';
import { LoadingState, EmptyState } from '../../components/common/Spinner';

export default function MyRequestsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    listMyRequests({ status, limit: 30 })
      .then(res => { if (current) setItems(res.data || []); })
      .catch(() => { if (current) { setItems([]); setError(true); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [status]);

  const statuses = [
    { value: '', label: t('common.all') },
    { value: 'open', label: t('status.request.open') },
    { value: 'assigned', label: t('status.request.assigned') },
    { value: 'in_progress', label: t('status.request.in_progress') },
    { value: 'completed', label: t('status.request.completed') },
    { value: 'cancelled', label: t('status.request.cancelled') },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2>{t('nav.my_requests')}</h2>
        <Link to="/requests/new" className="btn btn-primary">➕ {t('home.new_request')}</Link>
      </div>

      <div className="status-tabs mb-4">
        {statuses.map(s => (
          <button key={s.value} className={status === s.value ? 'active' : ''} onClick={() => setStatus(s.value)}>
            {s.label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="form-error">{t('errors.generic')}</p>}

      {loading ? <LoadingState /> :
       items.length === 0 ? <EmptyState title={t('common.none')} /> :
       <div className="grid grid-2">{items.map(r => <RequestCard key={r.id} request={r} />)}</div>}

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
