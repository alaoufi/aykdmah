import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests, listMyOffers } from '../../services/requestService';
import { useAuth } from '../../hooks/useAuth';
import RequestCard from '../../components/requests/RequestCard';
import { LoadingState, EmptyState } from '../../components/common/Spinner';
import { formatCurrency } from '../../utils/formatters';
import { OFFER_STATUS } from '../../utils/constants';
import useLiveRefresh from '../../hooks/useLiveRefresh';

export default function ProviderDashboardPage() {
  const { t } = useTranslation();
  const { provider } = useAuth();
  const [nearby, setNearby] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // New requests appear on their own (AYK-078).
  const [tick, quiet] = useLiveRefresh(['request:new_nearby', 'notification:new']);

  useEffect(() => {
    let current = true;
    if (!quiet) setLoading(true);
    setError(false);
    // Requests in the provider's own professions and districts only (AYK-040).
    const params = { limit: 20, matching: '1' };
    Promise.all([
      listNearbyRequests(params).then(r => r.data || []),
      listMyOffers({ limit: 5 }).then(r => r.data || []),
    ])
      .then(([n, o]) => { if (current) { setNearby(n); setOffers(o); } })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [tick]);

  if (loading) return <LoadingState />;

  return (
    <div>
      {error && <p role="alert" className="form-error">{t('errors.generic')}</p>}
      {/* Paused: say so first, since requesters cannot see them; the settings live in "ملفي". */}
      {provider?.availability_status === 'paused' && (
        <div className="card mb-4 flex items-center justify-between gap-2 flex-wrap" role="status" data-testid="paused-notice">
          <span>⏸ {t('work.paused_notice')}</span>
          <Link to="/profile#work" className="btn btn-primary btn-sm">▶ {t('work.resume_in_profile')}</Link>
        </div>
      )}

      <div className="card mb-4" data-testid="work-requests">
        <div className="flex justify-between items-center gap-2 flex-wrap mb-3">
          <h3 style={{ margin: 0 }}>📨 {t('work.requests_title')}</h3>
          <Link to="/opportunities" className="text-[13px] font-semibold">{t('work.see_all')}</Link>
        </div>
        {nearby.length === 0
          ? <EmptyState title={t('work.no_requests')} />
          : <div className="grid grid-2">{nearby.map(r => <RequestCard key={r.id} request={r} />)}</div>}
      </div>


      <div className="card">
        <div className="flex items-center justify-between gap-2">
          <h3>{t('work.my_contacts_title')}</h3>
          <Link to="/provider/tasks" className="text-[13px] font-semibold underline">{t('work.see_all')}</Link>
        </div>
        {offers.length === 0
          ? <EmptyState title={t('common.none')} />
          : (
            <div className="flex flex-col gap-2">
              {offers.map(o => {
                const oStatus = OFFER_STATUS[o.status] || {};
                return (
                  <Link key={o.id} to={`/requests/${o.request_id}`} className="offer-list-item tone-request">
                    <div style={{ flex: 1 }}>
                      <strong>{o.request_title}</strong>
                      <div className="text-xs text-muted">{o.status === 'accepted' ? <b className="text-primary">📌 {t('work.assigned_to_you')}</b> : (oStatus.i18nKey ? t(oStatus.i18nKey) : o.status)}</div>
                    </div>
                    {Number(o.price) > 0 && <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(o.price)}</div>}
                  </Link>
                );
              })}
            </div>
          )}
      </div>

      <style>{`
        .offer-list-item {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px;
          border: 1px solid var(--border); border-radius: var(--radius); color: inherit; text-decoration: none;
        }
        .offer-list-item:hover { background: var(--bg-soft); text-decoration: none; }
      `}</style>
    </div>
  );
}
