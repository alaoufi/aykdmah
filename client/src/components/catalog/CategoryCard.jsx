import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tx } from '../../utils/localize';
import { serviceCountByCategory } from '../../data/servicesCatalog';

export default function CategoryCard({ category, query = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const count = serviceCountByCategory(category.slug);

  return (
    <div className="group bg-white rounded-card border border-slate-200/80 p-5 flex flex-col hover:border-brand-200 hover:shadow-card transition">
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-14 h-14 rounded-card grid place-items-center text-2xl shrink-0 transition group-hover:scale-105"
          style={{ background: category.bg, color: category.tint }}
        >
          {category.icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-[16px] font-extrabold text-ink leading-tight">{tx(category.name, lang)}</h3>
          <div className="text-[12px] text-sand-600 font-semibold mt-0.5">
            {t('catalog.services_available', { count })}
          </div>
        </div>
      </div>
      <p className="text-[13px] text-slate-500 leading-relaxed line-clamp-2 mb-4 flex-1">
        {tx(category.desc, lang)}
      </p>
      <Link
        to={`/services/category/${category.slug}${query ? `?${query}` : ''}`}
        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-pill bg-slate-50 hover:bg-brand-50 hover:text-brand-700 text-slate-700 text-[13px] font-bold transition no-underline"
      >
        {t('catalog.browse_services')}
        <span className="rtl:rotate-180">→</span>
      </Link>
    </div>
  );
}
