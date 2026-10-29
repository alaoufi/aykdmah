import { localizedJoinedName } from '../../utils/localizeJoined';
import { useTranslation } from 'react-i18next';
import { IconClock, IconPin, IconArrow } from '../common/Icons';
import { formatRelativeTime, truncate } from '../../utils/formatters';
import useOpenRequest from '../../hooks/useOpenRequest';
import { OwnerBadge } from '../requests/RequestCard';

export default function RequestCard({ item, urgent = false }) {
  const { t, i18n } = useTranslation();
  const tag = localizedJoinedName(item, 'category', i18n.resolvedLanguage) || localizedJoinedName(item, 'service', i18n.resolvedLanguage) || t('nav.services');
  const cityLine = [localizedJoinedName(item, 'city', i18n.resolvedLanguage), localizedJoinedName(item, 'district', i18n.resolvedLanguage)].filter(Boolean).join(' — ');
  const { open, opening, mine, forMyService } = useOpenRequest();

  return (
    <article
      role="link" tabIndex={0} data-testid="request-card"
      onClick={() => open(item)} onKeyDown={e => { if (e.key === 'Enter') open(item); }}
      className={`cursor-pointer ${mine(item) ? 'ring-2 ring-sky-300 ' : forMyService(item) ? 'ring-2 ring-emerald-300 ' : ''}`group bg-white rounded-card border ${
        urgent ? 'border-rose-100' : 'border-slate-200/80'
      } p-4 md:p-5 flex flex-col gap-3 transition hover:shadow-card hover:-translate-y-0.5 hover:border-brand-200`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-pill text-[11px] font-bold ${
            urgent ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-700'
          }`}
        >
          {urgent && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 pulse-dot" />}
          {tag}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
          <IconClock size={13} />
          {formatRelativeTime(item.created_at)}
        </span>
      </div>

      <OwnerBadge mine={mine(item)} forService={forMyService(item)} />

      <h3 className="text-[15px] md:text-[16px] font-extrabold text-ink leading-snug">
        {item.title}
      </h3>

      <p className="text-[13px] text-slate-500 leading-relaxed line-clamp-2">
        {truncate(item.description, 120)}
      </p>

      {cityLine && (
        <div className="flex items-center gap-1.5 text-[12px] text-slate-600 font-medium">
          <IconPin size={14} className="text-brand-500" />
          {cityLine}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 mt-auto border-t border-slate-100">
        <span />
        <span
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-[12.5px] font-bold text-white transition active:scale-[.97] no-underline ${
            urgent ? 'bg-rose-500 hover:bg-rose-600' : 'bg-ink hover:bg-slate-800'
          }`}
        >
          {opening === item.id ? '…' : forMyService(item) ? `💬 ${t('request.contact_owner')}` : t('common.details')}
          <IconArrow size={14} className="rotate-180" />
        </span>
      </div>
    </article>
  );
}
