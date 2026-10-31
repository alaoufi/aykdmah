import { localizedJoinedName } from '../../utils/localizeJoined';
import { useTranslation } from 'react-i18next';
import { REQUEST_STATUS } from '../../utils/constants';
import { formatRelativeTime, formatCurrency, truncate, formatDistance } from '../../utils/formatters';
import useOpenRequest from '../../hooks/useOpenRequest';

// Whose request this is (AYK-044): "Your request" (as a requester) or "For your
// service" (as a provider), in different colours.
export function OwnerBadge({ mine, forService }) {
  const { t } = useTranslation();
  if (mine) return <span className="inline-flex w-fit px-2 py-0.5 rounded-pill bg-sky-100 text-sky-800 text-[11px] font-bold" data-testid="badge-mine">📋 {t('requester.badge_mine')}</span>;
  if (forService) return <span className="inline-flex w-fit px-2 py-0.5 rounded-pill bg-emerald-100 text-emerald-800 text-[11px] font-bold" data-testid="badge-service">🛠️ {t('requester.badge_service')}</span>;
  return null;
}

export default function RequestCard({ request }) {
  const { t, i18n } = useTranslation();
  const status = REQUEST_STATUS[request.status] || { color: 'badge' };
  const statusLabel = status.i18nKey ? t(status.i18nKey) : request.status;

  const { open, opening, mine, forMyService } = useOpenRequest();

  return (
    <div role="link" tabIndex={0} onClick={() => open(request)} onKeyDown={e => { if (e.key === 'Enter') open(request); }}
      className={`request-card card card-hover tone-request ${mine(request) ? 'own' : forMyService(request) ? 'for-service' : ''}`} data-testid="request-card">
      {/* Compact (AYK-099): whose, urgency, status and age on one line. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <OwnerBadge mine={mine(request)} forService={forMyService(request)} />
        {request.is_urgent ? <span className="badge badge-urgent">⚡ {t('request.urgent')}</span> : null}
        <span className={`badge ${status.color}`}>{statusLabel}</span>
        <span className="ms-auto text-[11.5px] text-muted">{formatRelativeTime(request.created_at)}</span>
      </div>

      <h3 className="mt-1.5 mb-0 text-[16px] font-bold leading-snug">{request.title}</h3>
      {request.description && request.description.trim() !== String(request.title || '').trim() && (
        <p className="text-secondary text-[13px] m-0 mt-0.5 truncate">{truncate(request.description, 110)}</p>
      )}

      <div className="meta flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[12.5px] text-secondary">
        {request.category_name && <span>🛠️ {localizedJoinedName(request, 'category', i18n.resolvedLanguage)}</span>}
        {request.city_name && <span>📍 {localizedJoinedName(request, 'city', i18n.resolvedLanguage)}{request.district_name ? ` · ${localizedJoinedName(request, 'district', i18n.resolvedLanguage)}` : ''}</span>}
        {request.distance_km != null && <span>📏 {formatDistance(request.distance_km)}</span>}
        {request.offers_count > 0 && <span>📨 {request.offers_count} {t('request.offers_count')}</span>}
        {request.budget_min && (
          <span>💰 {formatCurrency(request.budget_min)}{request.budget_max ? ` — ${formatCurrency(request.budget_max)}` : ''}</span>
        )}
      </div>
      <style>{`
        .request-card { display: block; text-decoration: none; color: inherit; padding: 12px 14px; cursor: pointer; }
        .request-card .badge { padding: 2px 8px; font-size: 11px; }
      `}</style>
      {forMyService(request) && <div className="mt-1.5 text-[13px] font-bold text-primary">{opening === request.id ? '…' : `💬 ${t('request.contact_owner')}`}</div>}
    </div>
  );
}
