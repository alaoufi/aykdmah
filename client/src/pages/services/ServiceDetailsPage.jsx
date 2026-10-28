import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getService, getCategory, reviewsForService } from '../../data/servicesCatalog';
import { tx } from '../../utils/localize';
import ServiceRequestForm from '../../components/catalog/ServiceRequestForm';
import { EmptyState } from '../../components/common/Spinner';
import useCatalogFilters from '../../hooks/useCatalogFilters';
import CatalogLocationNotice from '../../components/catalog/CatalogLocationNotice';

function Section({ title, children }) {
  return (
    <div className="bg-white rounded-card border border-slate-100 p-5 md:p-6">
      <h2 className="text-ink text-[16px] font-extrabold mb-3">{title}</h2>
      {children}
    </div>
  );
}

export default function ServiceDetailsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { id } = useParams();
  const service = getService(id);
  const [orderOpen, setOrderOpen] = useState(false);
  const discovery = useCatalogFilters();
  const catalogUrl = `/services${discovery.query ? `?${discovery.query}` : ''}`;

  if (!service) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <EmptyState title={t('catalog.no_results')} />
        <div className="text-center mt-4">
          <Link to={catalogUrl} className="text-brand-600 font-semibold no-underline">{t('catalog.browse_all')}</Link>
        </div>
      </div>
    );
  }

  const category = getCategory(service.categorySlug);
  const reviews = reviewsForService(service.id);

  return (
    <div className="bg-cream min-h-screen">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-10">
        <p className="text-sm text-slate-500 mb-4">{t('catalog.demo_notice')}</p>
        <CatalogLocationNotice {...discovery} />

        {/* Breadcrumb */}
        <div className="flex items-center flex-wrap gap-2 text-[12.5px] text-slate-500 mb-4">
          <Link to={catalogUrl} className="hover:text-brand-700 no-underline">{t('catalog.title')}</Link>
          <span className="rtl:rotate-180">›</span>
          {category && (
            <>
              <Link to={`/services/category/${category.slug}${discovery.query ? `?${discovery.query}` : ''}`} className="hover:text-brand-700 no-underline">{tx(category.name, lang)}</Link>
              <span className="rtl:rotate-180">›</span>
            </>
          )}
          <span className="font-semibold text-ink">{tx(service.title, lang)}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Main */}
          <div className="space-y-5 min-w-0">
            {/* Cover / gallery */}
            <div className="h-48 md:h-64 rounded-card grid place-items-center text-7xl" style={{ background: service.cover }}>
              {service.icon}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <h1 className="text-ink text-2xl md:text-3xl font-extrabold tracking-tight">{tx(service.title, lang)}</h1>
                {service.featured && <span className="px-2 py-0.5 rounded-pill bg-sand-500 text-white text-[11px] font-bold">{t('catalog.featured_badge')}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
                {service.ratingCount > 0 && <span className="text-amber-600 font-bold">★ {service.rating.toFixed(1)} <span className="text-slate-400 font-normal">({service.ratingCount})</span></span>}
                {service.ordersCount > 0 && <span>📦 {t('catalog.orders', { count: service.ordersCount })}</span>}
                <span>⏱ {tx(service.duration, lang)}</span>
              </div>
            </div>

            <Section title={t('catalog.description')}>
              <p className="text-[14px] text-slate-600 leading-relaxed whitespace-pre-wrap">{tx(service.longDesc, lang)}</p>
            </Section>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Section title={t('catalog.includes')}>
                <ul className="space-y-2">
                  {service.includes.map((it, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13.5px] text-slate-600"><span className="text-emerald-500">✓</span>{tx(it, lang)}</li>
                  ))}
                </ul>
              </Section>
              <Section title={t('catalog.excludes')}>
                <ul className="space-y-2">
                  {service.excludes.map((it, i) => (
                    <li key={i} className="flex items-start gap-2 text-[13.5px] text-slate-600"><span className="text-rose-400">✕</span>{tx(it, lang)}</li>
                  ))}
                </ul>
              </Section>
            </div>

            {service.packages.length > 0 && (
              <Section title={t('catalog.packages')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {service.packages.map((p, i) => (
                    <div key={i} className="border border-slate-200 rounded-card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-ink text-[14px]">{tx(p.name, lang)}</span>
                        <span className="font-extrabold text-brand-700">{p.price} {t('common.currency')}</span>
                      </div>
                      <ul className="space-y-1">
                        {p.features.map((f, j) => <li key={j} className="text-[12.5px] text-slate-500">• {tx(f, lang)}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            <Section title={t('catalog.coverage')}>
              <p className="text-[14px] text-slate-600">📍 {t('for_you.coverage_text')}</p>
            </Section>

            <Section title={t('catalog.terms')}>
              <p className="text-[13.5px] text-slate-500 leading-relaxed">{t('catalog.terms_text')}</p>
            </Section>

            {/* Reviews */}
            <Section title={t('catalog.reviews')}>
              {reviews.length === 0 ? (
                <p className="text-[13.5px] text-slate-400">{t('catalog.no_reviews')}</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r, i) => (
                    <div key={i} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-ink text-[13.5px]">{r.author}</span>
                        <span className="text-amber-600 text-[12px] font-bold">{'★'.repeat(r.rating)}</span>
                      </div>
                      <p className="text-[13px] text-slate-600">{tx(r.comment, lang)}</p>
                      <span className="text-[11px] text-slate-400">{r.at}</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* Sidebar */}
          <aside className="lg:sticky lg:top-20 self-start space-y-4">
            <div className="bg-white rounded-card border border-slate-100 shadow-soft p-5">
              {Number.isFinite(service.priceFrom) ? <>
                <div className="text-[12px] text-slate-400 font-medium">{t('catalog.price_from')}</div>
                <div className="text-[28px] font-extrabold text-ink mb-1">{service.priceFrom} <span className="text-[15px] font-semibold text-sand-600">{t('common.currency')}</span></div>
              </> : <p className="text-sm text-slate-600 font-semibold mb-3">{t('catalog.offers_price')}</p>}
              <div className="text-[12.5px] text-slate-500 mb-4">⏱ {tx(service.duration, lang)}</div>
              <button
                onClick={() => setOrderOpen(true)}
                disabled={!discovery.valid}
                className="w-full py-3 rounded-pill text-white disabled:opacity-50 text-[15px] font-bold shadow-soft hover:shadow-lift transition active:scale-[.98]"
                style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
              >
                {t('catalog.order_now')}
              </button>
            </div>

            {/* Provider */}
            <div className="bg-white rounded-card border border-slate-100 shadow-soft p-5">
              <div className="text-[12px] text-slate-400 font-medium mb-2">{t('catalog.about_provider')}</div>
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-full bg-brand-50 text-brand-700 grid place-items-center font-extrabold">
                  {tx(service.provider.name, lang).charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="font-bold text-ink text-[14px] flex items-center gap-1.5">
                    {tx(service.provider.name, lang)}
                    {service.provider.verified && <span className="text-emerald-500 text-[12px]">✓</span>}
                  </div>
                  {service.provider.id && <div className="text-[12px] text-slate-500">★ {service.provider.rating.toFixed(1)} · {t('catalog.orders', { count: service.provider.ordersCount })}</div>}
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div className="text-center text-[11px] text-slate-400 mt-8">{t('catalog.demo_notice')}</div>
      </div>

      <ServiceRequestForm service={orderOpen ? service : null} open={orderOpen} onClose={() => setOrderOpen(false)} />
    </div>
  );
}
