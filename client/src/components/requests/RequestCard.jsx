import TrustSummary from '../reviews/TrustSummary';
import { localizedJoinedName } from '../../utils/localizeJoined';
import { useTranslation } from 'react-i18next';
import { formatRelativeTime, formatCurrency, truncate, formatDistance } from '../../utils/formatters';
import useOpenRequest from '../../hooks/useOpenRequest';
import useRequestTranslation from '../../hooks/useRequestTranslation';
import TranslatedNote from './TranslatedNote';
import ContactButtons from '../providers/ContactButtons';
import RequestStatusBadge from './RequestStatusBadge';
import useContactIntro from '../../hooks/useContactIntro';
import ShareMenu from '../common/ShareMenu';
import { SITE_URL } from '../../utils/site';

// Whose request this is (AYK-044): "Your request" (as a requester) or "For your
// service" (as a provider), in different colours.
export function OwnerBadge({ mine, forService }) {
  const { t } = useTranslation();
  if (mine) return <span className="tone-request inline-flex w-fit px-2 py-0.5 rounded-pill text-fg text-[11px] font-bold" data-testid="badge-mine">📋 {t('requester.badge_mine')}</span>;
  if (forService) return <span className="tone-provider inline-flex w-fit px-2 py-0.5 rounded-pill text-fg text-[11px] font-bold" data-testid="badge-service">🛠️ {t('requester.badge_service')}</span>;
  return null;
}

export default function RequestCard({ request }) {
  const { t, i18n } = useTranslation();

  const { open, opening, mine, forMyService, canContact, contact } = useOpenRequest();
  const translation = useRequestTranslation(request);
  const intro = useContactIntro();

  return (
    <div role="link" tabIndex={0} onClick={() => open(request)} onKeyDown={e => { if (e.key === 'Enter') open(request); }}
      className={`request-card card card-hover tone-request ${mine(request) ? 'own' : forMyService(request) ? 'for-service' : ''}`} data-testid="request-card">
      {/* AYK-438: the requester's name when they chose to show it. */}
      {request.client_contact_name && <div className="text-[13px] font-bold text-fg" data-testid="request-client-name">👤 {request.client_contact_name}</div>}
      <TrustSummary userId={request.client_id} type="on_requester" average={request.client_rating_avg} count={request.client_rating_count} opinion={request.client_opinion} />
      {/* Compact (AYK-099): whose, urgency, status and age on one line. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {!canContact(request) && <OwnerBadge mine={mine(request)} forService={false} />}
        {/* AYK-398: someone this provider already worked for. */}
        {request.previous_client ? <span className="badge badge-success" data-testid="badge-previous-client">⭐ {t('work.previous_client')}</span> : null}
        {request.is_urgent ? <span className="badge badge-urgent">⚡ {t('request.urgent')}</span> : null}
        <span className="ms-auto text-[11.5px] text-muted">{formatRelativeTime(request.created_at)}</span>
      </div>

      {/* AYK-432: the state beside the title; open reads «متاح» in fixed green. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="m-0 min-w-0 text-[16px] font-bold leading-snug">{translation.title}</h3>
        <RequestStatusBadge status={request.status} />
      </div>
      {translation.description && translation.description.trim() !== translation.title.trim() && (
        <p className="text-secondary text-[13px] m-0 mt-0.5 truncate">{truncate(translation.description, 110)}</p>
      )}
      <TranslatedNote translation={translation} />

      {/* AYK-431 (the owner: «آخر اللوحة ممكن تكون أجمل»): the details as small soft chips, and the
          contact icons at the end of the same line (AYK-418, AYK-427, AYK-430). */}
      <div className="flex items-end gap-2 mt-2">
        <div className="meta min-w-0 flex-1 flex flex-wrap gap-1 text-[11.5px] text-fg-muted">
          {request.category_name && <span className="chip">🛠️ {localizedJoinedName(request, 'category', i18n.resolvedLanguage)}</span>}
          {request.city_name && <span className="chip">📍 {localizedJoinedName(request, 'city', i18n.resolvedLanguage)}{request.district_name ? ` · ${localizedJoinedName(request, 'district', i18n.resolvedLanguage)}` : ''}</span>}
          {request.distance_km != null && <span className="chip">📏 {formatDistance(request.distance_km)}</span>}
          {request.offers_count > 0 && <span className="chip">📨 {request.offers_count} {t('request.offers_count')}</span>}
          {/* AYK-244: present only when views are public (admin setting) or the viewer is an admin. */}
          {request.views_count != null && <span className="chip">👁 {request.views_count}</span>}
          {request.budget_min && (
            <span className="chip">💰 {formatCurrency(request.budget_min)}{request.budget_max ? ` — ${formatCurrency(request.budget_max)}` : ''}</span>
          )}
        </div>
        {/* AYK-436: share the request, for the requester and for providers. */}
        <span className="shrink-0 inline-flex" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <ShareMenu variant="icon-sm" url={`${SITE_URL}/requests/${request.id}`} title={translation.title}
            text={t('share.request_text', { title: translation.title })} testId="request-share" />
        </span>
        {canContact(request) && <ContactButtons size="xs" phone={request.client_contact_phone} whatsapp={request.client_contact_whatsapp}
          busy={opening === request.id} onChat={() => contact(request)} testId="request-contact" intro={intro({ request: translation.title })} link={`/requests/${request.id}`} />}
      </div>
      <style>{`
        .request-card { display: block; text-decoration: none; color: inherit; padding: 12px 14px; cursor: pointer; }
        .request-card .badge { padding: 2px 8px; font-size: 11px; }
        .request-card .chip { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 9999px;
          background: rgb(var(--color-surface-alt, 241 245 249)); border: 1px solid rgb(var(--color-border, 226 232 240)); line-height: 1.5; white-space: nowrap; }
      `}</style>
    </div>
  );
}
