import { localizedJoinedName } from '../../utils/localizeJoined';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IconClock, IconPin, IconArrow } from '../common/Icons';
import { formatCurrency, formatRelativeTime, truncate } from '../../utils/formatters';

export default function RequestCard({ item, urgent = false }) {
  const { t, i18n } = useTranslation();
  const tag = localizedJoinedName(item, 'category', i18n.resolvedLanguage) || localizedJoinedName(item, 'service', i18n.resolvedLanguage) || t('nav.services');
  const cityLine = [localizedJoinedName(item, 'city', i18n.resolvedLanguage), localizedJoinedName(item, 'district', i18n.resolvedLanguage)].filter(Boolean).join(' — ');
  const price = item.budget_min
    ? formatCurrency(item.budget_min) + (item.budget_max ? ` - ${formatCurrency(item.budget_max)}` : '')
    : t('request.budget_not_set');

  return (
    <article
      className={`group bg-white rounded-card border ${
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
        <div className="flex flex-col">
          <span className="text-[10px] text-slate-400 font-medium">{t('offer.price')}</span>
          <span className="text-[15px] font-extrabold text-ink">{price}</span>
        </div>
        <Link
          to={`/requests/${item.id}`}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-[12.5px] font-bold text-white transition active:scale-[.97] no-underline ${
            urgent ? 'bg-rose-500 hover:bg-rose-600' : 'bg-ink hover:bg-slate-800'
          }`}
        >
          {t('common.details')}
          <IconArrow size={14} className="rotate-180" />
        </Link>
      </div>
    </article>
  );
}
