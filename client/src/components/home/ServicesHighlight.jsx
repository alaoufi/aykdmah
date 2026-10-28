import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, popularServices } from '../../data/servicesCatalog';
import { tx } from '../../utils/localize';

export default function ServicesHighlight() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const cats = CATEGORIES.slice(0, 6);
  const popular = popularServices(4);

  return (
    <section className="py-6 md:py-20 bg-cream">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-4 md:mb-10">
          <div className="text-[12px] font-bold text-sand-600 mb-2">{t('common.brand')}</div>
          <h2 className="text-ink text-xl md:text-3xl lg:text-4xl font-extrabold tracking-tight">{t('catalog.hero_title')}</h2>
          <p className="text-slate-500 text-sm md:text-[15px] mt-3">{t('catalog.hero_subtitle')}</p>
        </div>

        {/* Featured categories */}
        <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-4 mb-5 md:mb-10">
          {cats.map((c) => (
            <Link
              key={c.id}
              to={`/services/category/${c.slug}`}
              className="group bg-white border border-slate-200/80 rounded-card p-4 flex flex-col items-center text-center hover:border-brand-200 hover:shadow-card transition no-underline"
            >
              <span className="w-14 h-14 rounded-full grid place-items-center text-2xl mb-2.5 transition group-hover:scale-110" style={{ background: c.bg, color: c.tint }}>
                {c.icon}
              </span>
              <span className="text-[13px] font-bold text-ink leading-tight">{tx(c.name, lang)}</span>
            </Link>
          ))}
        </div>

        <p className="text-sm text-slate-500 mb-4">{t('catalog.demo_notice')}</p>

        {/* Popular services */}
        <div className="flex items-end justify-between mb-5">
          <h3 className="text-ink text-lg md:text-xl font-extrabold">{t('catalog.popular_title')}</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 md:gap-4 mb-5 md:mb-8">
          {popular.map((s) => (
            <Link
              key={s.id}
              to={`/services/${s.id}`}
              className="bg-white border border-slate-200/80 rounded-card overflow-hidden hover:border-brand-200 hover:shadow-card transition no-underline flex flex-col"
            >
              <div className="h-14 md:h-24 grid place-items-center text-2xl md:text-4xl" style={{ background: s.cover }}>{s.icon}</div>
              <div className="p-2.5 md:p-3.5 flex flex-col flex-1">
                <div className="text-[13px] md:text-[14px] font-bold text-ink leading-snug mb-0.5 md:mb-1 line-clamp-1">{tx(s.title, lang)}</div>
                <div className="flex items-center gap-2 text-[11.5px] text-slate-500 mb-2">
                  {s.ratingCount > 0 && <span className="text-amber-600 font-bold">★ {s.rating.toFixed(1)}</span>}
                </div>
                <div className="mt-auto text-[13px] font-extrabold text-ink">
                  {Number.isFinite(s.priceFrom) ? <>{t('catalog.price_from')} {s.priceFrom} <span className="text-[11px] text-sand-600 font-semibold">{t('common.currency')}</span></> : t('catalog.offers_price')}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="text-center">
          <Link
            to="/services"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-pill text-white font-bold shadow-soft hover:shadow-lift transition no-underline"
            style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
          >
            {t('catalog.browse_all')}
            <span className="rtl:rotate-180">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
