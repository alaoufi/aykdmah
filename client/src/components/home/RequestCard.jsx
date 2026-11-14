import TrustSummary from '../reviews/TrustSummary';
import { localizedJoinedName } from '../../utils/localizeJoined';
import { useTranslation } from 'react-i18next';
import { IconClock, IconPin, IconArrow } from '../common/Icons';
import { formatRelativeTime, truncate } from '../../utils/formatters';
import useOpenRequest from '../../hooks/useOpenRequest';
import { OwnerBadge } from '../requests/RequestCard';
import useRequestTranslation from '../../hooks/useRequestTranslation';
import TranslatedNote from '../requests/TranslatedNote';

export default function RequestCard({ item, urgent = false }) {
  const { t, i18n } = useTranslation();
  const tag = localizedJoinedName(item, 'category', i18n.resolvedLanguage) || localizedJoinedName(item, 'service', i18n.resolvedLanguage) || t('nav.services');
  const cityLine = [localizedJoinedName(item, 'city', i18n.resolvedLanguage), localizedJoinedName(item, 'district', i18n.resolvedLanguage)].filter(Boolean).join(' — ');
  const { open, opening, mine, forMyService } = useOpenRequest();
  const translation = useRequestTranslation(item);

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
        <TrustSummary userId={item.client_id} type="on_requester" average={item.client_rating_avg} count={item.client_rating_count} opinion={item.client_opinion} />
        <OwnerBadge mine={mine(item)} forService={forMyService(item)} />
        <span className="ms-auto inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          <IconClock size={13} />
          {formatRelativeTime(item.created_at)}
        </span>
      </div>

      <h3 className="text-[14px] md:text-[15px] font-extrabold text-fg leading-snug line-clamp-2 m-0">
        {translation.title}
      </h3>

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
        <span
          className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-primary"
        >
          {opening === item.id ? '…' : forMyService(item) ? `💬 ${t('request.contact_owner')}` : t('common.details')}
          <IconArrow size={14} className="rotate-180" />
        </span>
      </div>
    </article>
  );
}
