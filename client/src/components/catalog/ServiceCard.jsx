import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tx } from '../../utils/localize';

export default function ServiceCard({ service, onOrder, query = '', locationLabel = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';

  return (
    <article className="group bg-white rounded-card border border-slate-200/80 overflow-hidden flex flex-col hover:border-brand-200 hover:shadow-card transition">
      {/* Cover */}
      <div className="relative h-28 grid place-items-center text-4xl" style={{ background: service.cover }}>
        <span>{service.icon}</span>
        {service.featured && (
          <span className="absolute top-2 inset-inline-start-2 px-2 py-0.5 rounded-pill bg-sand-500 text-white text-[10px] font-bold">
            {t('catalog.featured_badge')}
          </span>
        )}
        {service.ratingCount > 0 && <span className="absolute top-2 inset-inline-end-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-pill bg-white/90 text-amber-600 text-[11px] font-bold">
          ★ {service.rating.toFixed(1)}
        </span>}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-[15px] font-extrabold text-ink leading-snug mb-1">{tx(service.title, lang)}</h3>
        <p className="text-[12.5px] text-slate-500 leading-relaxed line-clamp-2 mb-3 flex-1">{tx(service.desc, lang)}</p>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500 mb-3">
          <span>⏱ {tx(service.duration, lang)}</span>
          {service.ordersCount > 0 && <span>📦 {t('catalog.orders', { count: service.ordersCount })}</span>}
        </div>

        {locationLabel && <p className="text-[11.5px] text-slate-600 mb-3">{t('catalog.request_location')}: {locationLabel}</p>}
        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex flex-col">
            {Number.isFinite(service.priceFrom) ? <>
              <span className="text-[10px] text-slate-400 font-medium">{t('catalog.price_from')}</span>
              <span className="text-[16px] font-extrabold text-ink">{service.priceFrom} <span className="text-[12px] font-semibold text-sand-600">{t('common.currency')}</span></span>
            </> : <span className="text-[11.5px] text-slate-500">{t('catalog.offers_price')}</span>}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Link
              to={`/services/${service.id}${query ? `?${query}` : ''}`}
              className="px-3 py-2 rounded-pill bg-slate-50 hover:bg-slate-100 text-slate-700 text-[12px] font-bold transition no-underline"
            >
              {t('catalog.view_details')}
            </Link>
            <button
              type="button"
              onClick={() => onOrder?.(service)}
              className="px-3.5 py-2 rounded-pill text-white text-[12px] font-bold transition active:scale-[.97]"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
            >
              {t('catalog.order_service')}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
