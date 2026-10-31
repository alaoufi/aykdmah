import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { listMyOffers } from '../../services/requestService';
import { LoadingState, EmptyState } from '../../components/common/Spinner';
import { formatCurrency } from '../../utils/formatters';
import { OFFER_STATUS } from '../../utils/constants';

// "My professional tasks" (AYK-075): requests the provider contacted or was assigned,
// active ones apart from the archive of finished, cancelled or lost ones.
export default function MyTasksPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const scope = params.get('tab') === 'archive' ? 'archive' : 'active';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [tick, quiet] = useLiveRefresh(['notification:new']);
  useEffect(() => {
    let current = true;
    if (!quiet) setLoading(true);
    setError(false);
    listMyOffers({ scope, limit: 50 })
      .then(res => { if (current) setItems(res.data || []); })
      .catch(() => { if (current) { setItems([]); setError(true); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [scope, tick]);

  const label = o => {
    if (scope === 'active') return o.status === 'accepted' ? <b className="text-primary">📌 {t('work.assigned_to_you')}</b> : t('work.task_waiting');
    if (o.request_status && o.request_status !== 'open') return t(`status.request.${o.request_status}`);
    const s = OFFER_STATUS[o.status] || {};
    return s.i18nKey ? t(s.i18nKey) : o.status;
  };

  return (
    <div>
      <h2 className="m-0">🧰 {t('work.tasks_title')}</h2>
      <p className="text-[13px] text-fg-muted mt-1 mb-4">{t('work.tasks_hint')}</p>
      <div className="status-tabs mb-4">
        {['active', 'archive'].map(v => (
          <button key={v} type="button" data-testid={`tab-${v}`} className={scope === v ? 'active' : ''}
            onClick={() => setParams(v === 'archive' ? { tab: 'archive' } : {}, { replace: true })}>
            {v === 'active' ? `🟢 ${t('manage.active')}` : `🗄️ ${t('manage.archive')}`}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="form-error">{t('errors.generic')}</p>}
      {loading ? <LoadingState /> :
       items.length === 0 ? <EmptyState title={t('common.none')} /> :
       <div className="flex flex-col gap-2">{items.map(o => (
         <Link key={o.id} to={`/requests/${o.request_id}`} className="offer-list-item tone-request" data-testid="task-item">
           <div style={{ flex: 1 }}>
             <strong>{o.request_title}</strong>
             <div className="text-xs text-muted">{label(o)}</div>
           </div>
           {Number(o.price) > 0 && <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(o.price)}</div>}
         </Link>
       ))}</div>}
      <style>{`
        .status-tabs { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
        .status-tabs button {
          padding: 8px 16px; border: 1px solid var(--border); background: var(--bg-card);
          border-radius: 999px; cursor: pointer; white-space: nowrap; font: inherit; color: var(--text-secondary);
        }
        .status-tabs button.active { background: var(--primary); color: #fff; border-color: var(--primary); }
        .offer-list-item {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px;
          border: 1px solid var(--border); border-radius: var(--radius); color: inherit; text-decoration: none;
        }
        .offer-list-item:hover { background: var(--bg-soft); text-decoration: none; }
      `}</style>
    </div>
  );
}
