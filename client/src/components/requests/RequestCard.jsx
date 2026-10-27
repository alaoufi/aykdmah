import { localizedJoinedName } from '../../utils/localizeJoined';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { REQUEST_STATUS } from '../../utils/constants';
import { formatRelativeTime, formatCurrency, truncate, formatDistance } from '../../utils/formatters';

export default function RequestCard({ request }) {
  const { t, i18n } = useTranslation();
  const status = REQUEST_STATUS[request.status] || { color: 'badge' };
  const statusLabel = status.i18nKey ? t(status.i18nKey) : request.status;

  return (
    <Link to={`/requests/${request.id}`} className="request-card card card-hover">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {request.is_urgent ? <span className="badge badge-urgent">⚡ {t('request.urgent')}</span> : null}
          <span className={`badge ${status.color}`}>{statusLabel}</span>
        </div>
        <span className="text-xs text-muted">{formatRelativeTime(request.created_at)}</span>
      </div>

      <h3 className="mt-3 mb-1" style={{ fontSize: 18 }}>{request.title}</h3>
      <p className="text-secondary text-sm">{truncate(request.description, 110)}</p>

      <div className="meta flex flex-wrap gap-3 mt-3 text-sm text-secondary">
        {request.category_name && <span>🛠️ {localizedJoinedName(request, 'category', i18n.resolvedLanguage)}</span>}
        {request.city_name && <span>📍 {localizedJoinedName(request, 'city', i18n.resolvedLanguage)}{request.district_name ? ` · ${localizedJoinedName(request, 'district', i18n.resolvedLanguage)}` : ''}</span>}
        {request.distance_km != null && <span>📏 {formatDistance(request.distance_km)}</span>}
        {request.offers_count > 0 && <span>📨 {request.offers_count} {t('request.offers_count')}</span>}
        {request.budget_min && (
          <span>💰 {formatCurrency(request.budget_min)}{request.budget_max ? ` — ${formatCurrency(request.budget_max)}` : ''}</span>
        )}
      </div>
      <style>{`
        .request-card { display: block; text-decoration: none; color: inherit; padding: 18px; }
        .request-card:hover { text-decoration: none; }
      `}</style>
    </Link>
  );
}
