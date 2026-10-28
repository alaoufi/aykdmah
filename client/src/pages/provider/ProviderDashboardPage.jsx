import { localizedJoinedName } from '../../utils/localizeJoined';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests, listMyOffers } from '../../services/requestService';
import { getCurrentSubscription } from '../../services/adminService';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useAuth } from '../../hooks/useAuth';
import RequestCard from '../../components/requests/RequestCard';
import { LoadingState, EmptyState } from '../../components/common/Spinner';
import { formatCurrency } from '../../utils/formatters';
import { OFFER_STATUS } from '../../utils/constants';
import AvailabilityBadge from '../../components/common/AvailabilityBadge';
import MyMarket from '../../components/provider/MyMarket';

export default function ProviderDashboardPage() {
  const { t, i18n } = useTranslation();
  const { provider } = useAuth();
  const [nearby, setNearby] = useState([]);
  const [offers, setOffers] = useState([]);
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { position, request: requestLoc } = useGeolocation();

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    const params = position ? { latitude: position.latitude, longitude: position.longitude, limit: 6, matching: '1' } : { limit: 6, matching: '1' };
    Promise.all([
      listNearbyRequests(params).then(r => r.data || []),
      listMyOffers({ limit: 5 }).then(r => r.data || []),
      getCurrentSubscription().catch(() => null),
    ])
      .then(([n, o, s]) => { if (current) { setNearby(n); setOffers(o); setSub(s); } })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [position]);

  if (loading) return <LoadingState />;

  return (
    <div>
      <h2 className="mb-2">{t('nav.dashboard')}</h2>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <AvailabilityBadge availability={provider?.availability} />
        <Link to="/profile#availability" className="text-[12.5px] font-semibold">{t('availability.manage')}</Link>
      </div>
      {error && <p role="alert" className="form-error">{t('errors.generic')}</p>}
      <div className="mb-5"><MyMarket /></div>

      <div className="grid grid-3 mb-4">
        <div className="stat-card">
          <div className="label">{t('common.rating')}</div>
          <div className="value">⭐ {Number(provider?.rating_avg || 0).toFixed(1)}</div>
          <div className="text-xs text-muted">{provider?.rating_count || 0} {t('offer.rating_count')}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('status.request.completed')}</div>
          <div className="value">{provider?.completed_orders || 0}</div>
        </div>
        <div className="stat-card">
          <div className="label">{t('nav.subscription')}</div>
          <div className="value" style={{ fontSize: 18 }}>{localizedJoinedName(sub, 'plan', i18n.resolvedLanguage) || '—'}</div>
          {!sub && <Link to="/provider/subscription" className="text-sm">{t('common.more')}</Link>}
        </div>
      </div>

      <div className="card mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 style={{ margin: 0 }}>{t('nav.services')}</h3>
          {!position && (
            <button className="btn btn-outline btn-sm" onClick={() => requestLoc().catch(() => {})}>📍 {t('home.use_my_location')}</button>
          )}
        </div>
        {nearby.length === 0
          ? <EmptyState title={t('common.none')} />
          : <div className="grid grid-2">{nearby.map(r => <RequestCard key={r.id} request={r} />)}</div>}
      </div>

      <div className="card">
        <h3>{t('nav.my_offers')}</h3>
        {offers.length === 0
          ? <EmptyState title={t('common.none')} />
          : (
            <div className="flex flex-col gap-2">
              {offers.map(o => {
                const oStatus = OFFER_STATUS[o.status] || {};
                return (
                  <Link key={o.id} to={`/requests/${o.request_id}`} className="offer-list-item">
                    <div style={{ flex: 1 }}>
                      <strong>{o.request_title}</strong>
                      <div className="text-xs text-muted">{oStatus.i18nKey ? t(oStatus.i18nKey) : o.status}</div>
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(o.price)}</div>
                  </Link>
                );
              })}
            </div>
          )}
      </div>

      <style>{`
        .stat-card {
          background: var(--bg-card); padding: 18px; border-radius: var(--radius-lg);
          border: 1px solid var(--border);
        }
        .stat-card .label { font-size: 12px; color: var(--text-muted); }
        .stat-card .value { font-size: 26px; font-weight: 700; color: var(--primary); margin-top: 6px; }
        .offer-list-item {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px;
          border: 1px solid var(--border); border-radius: var(--radius); color: inherit; text-decoration: none;
        }
        .offer-list-item:hover { background: var(--bg-soft); text-decoration: none; }
      `}</style>
    </div>
  );
}
