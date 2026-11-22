import TrustSummary from '../reviews/TrustSummary';
import { localizedJoinedName } from '../../utils/localizeJoined';
import { useTranslation } from 'react-i18next';
import { IconClock, IconPin, IconArrow } from '../common/Icons';
import { formatRelativeTime, truncate } from '../../utils/formatters';
import useOpenRequest from '../../hooks/useOpenRequest';
import { OwnerBadge } from '../requests/RequestCard';
import ContactButtons from '../providers/ContactButtons';
import useRequestTranslation from '../../hooks/useRequestTranslation';
import TranslatedNote from '../requests/TranslatedNote';
import RequestStatusBadge from '../requests/RequestStatusBadge';
import useContactIntro from '../../hooks/useContactIntro';
import ShareMenu from '../common/ShareMenu';
import { SITE_URL } from '../../utils/site';

export default function RequestCard({ item, urgent = false }) {
  const { t, i18n } = useTranslation();
  const tag = localizedJoinedName(item, 'category', i18n.resolvedLanguage) || localizedJoinedName(item, 'service', i18n.resolvedLanguage) || t('nav.services');
  const cityLine = [localizedJoinedName(item, 'city', i18n.resolvedLanguage), localizedJoinedName(item, 'district', i18n.resolvedLanguage)].filter(Boolean).join(' — ');
  const { open, opening, mine, forMyService, canContact, contact } = useOpenRequest();
  const translation = useRequestTranslation(item);
  const intro = useContactIntro();

  return (
    <article
      role="link" tabIndex={0} data-testid="request-card"
      onClick={() => open(item)} onKeyDown={e => { if (e.key === 'Enter') open(item); }}
      className={`cursor-pointer tone-request ${urgent ? 'ring-2 ring-rose-200 ' : ''}group rounded-card p-2.5 md:p-3 flex flex-col gap-1 transition hover:shadow-card hover:-translate-y-0.5`}
    >
      {/* Compact (AYK-104): profession, whose and age on one line. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[11px] font-bold ${
            urgent ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-700'
          }`}
        >
          {urgent && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 pulse-dot" />}
          {tag}
        </span>
        {item.client_contact_name && <span className="text-[12px] font-bold text-fg" data-testid="request-client-name">👤 {item.client_contact_name}</span>}
        <TrustSummary userId={item.client_id} type="on_requester" average={item.client_rating_avg} count={item.client_rating_count} opinion={item.client_opinion} />
        {!canContact(item) && <OwnerBadge mine={mine(item)} forService={false} />}
        {/* AYK-244: present only when views are public (admin setting) or the viewer is an admin. */}
        {item.views_count != null && <span className="ms-auto text-[11px] text-slate-500 font-medium">👁 {item.views_count}</span>}
        <span className={`${item.views_count != null ? '' : 'ms-auto '}inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium`}>
          <IconClock size={13} />
          {formatRelativeTime(item.created_at)}
        </span>
      </div>

      {/* AYK-432: «متاح» in fixed green beside the title. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="min-w-0 text-[14px] md:text-[15px] font-extrabold text-fg leading-snug line-clamp-2 m-0">
          {translation.title}
        </h3>
        <RequestStatusBadge status={item.status || 'open'} />
      </div>

      {translation.description && translation.description.trim() !== translation.title.trim() && (
        <p className="text-[12px] text-fg-muted leading-snug line-clamp-1 m-0">
          {truncate(translation.description, 120)}
        </p>
      )}
      <TranslatedNote translation={translation} />

      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className="min-w-0 flex items-center gap-1 text-[11px] text-fg-muted">
          {cityLine && <><IconPin size={13} className="shrink-0" /><span className="line-clamp-1">{cityLine}</span></>}
        </span>
        {/* AYK-431: the contact icons at the card's end (AYK-427, AYK-430); otherwise «details». */}
        {/* AYK-436/439: share the request: its owner always, others only when the requester allows it. */}
        {(mine(item) || Number(item.client_allow_share) === 1) && (
        <span className="shrink-0 inline-flex ms-auto" onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
          <ShareMenu variant="icon-sm" url={`${SITE_URL}/requests/${item.id}`} title={translation.title}
            text={t('share.request_text', { title: translation.title })} testId="request-share" />
        </span>)}
        {canContact(item)
          ? <ContactButtons size="xs" phone={item.client_contact_phone} whatsapp={item.client_contact_whatsapp} busy={opening === item.id} onChat={() => contact(item)} testId="request-contact" intro={intro({ request: translation.title })} link={`/requests/${item.id}`} />
          : <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-primary">
            {t('common.details')}
            <IconArrow size={14} className="rotate-180" />
          </span>}
      </div>
    </article>
  );
}
