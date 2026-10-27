import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listCategories } from '../../services/serviceService';
import { getCategoryIcon, IconShield, IconStar, IconClock, IconChat, IconChevL } from '../common/Icons';
import { localizedName } from '../../utils/localize';

export default function Categories() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [items, setItems] = useState([]);
  useEffect(() => { listCategories().then(setItems).catch(() => {}); }, []);

  const TRUST = [
    { Icon: IconShield, t: t('home.trust_verified_t'), s: t('home.trust_verified_s') },
    { Icon: IconStar,   t: t('home.trust_ratings_t'),  s: t('home.trust_ratings_s') },
    { Icon: IconClock,  t: t('home.trust_response_t'), s: t('home.trust_response_s') },
    { Icon: IconChat,   t: t('home.trust_support_t'),  s: t('home.trust_support_s') },
  ];

  return (
    <section className="relative -mt-10 md:-mt-14 z-10">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="bg-white rounded-[22px] shadow-card border border-slate-100 p-5 md:p-8">
          <div className="flex items-end justify-between mb-3 md:mb-7">
            <div>
              <div className="text-[12px] font-semibold text-brand-600 mb-1.5">{t('home.browse_by_category')}</div>
              <h2 className="text-ink text-xl md:text-3xl font-extrabold tracking-tight">
                {t('home.what_do_you_need')}
              </h2>
              <p className="text-slate-500 text-sm md:text-[15px] mt-1.5">
                {t('home.categories_count', { count: items.length })}
              </p>
            </div>
            <Link
              to="/services"
              className="hidden md:inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 font-semibold text-sm no-underline"
            >
              {t('home.view_all')}
              <IconChevL size={16} />
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-[120px] rounded-card bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
              {items.map((cat) => {
                const { Comp, tint, bg } = getCategoryIcon(cat.slug);
                return (
                  <Link
                    key={cat.id}
                    to={`/services?category=${cat.id}`}
                    className="cat-tile group bg-white border border-slate-200/80 rounded-card p-4 md:p-5 flex flex-col items-center text-center hover:border-brand-200 no-underline"
                  >
                    <span
                      className="w-14 h-14 md:w-16 md:h-16 rounded-full grid place-items-center mb-3 transition group-hover:scale-110"
                      style={{ background: bg, color: tint }}
                    >
                      <Comp size={26} />
                    </span>
                    <span className="text-[13px] md:text-[14px] font-bold text-ink leading-tight">
                      {localizedName(cat, lang)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="mt-4 md:mt-8 pt-3 md:pt-6 border-t border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {TRUST.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-card grid place-items-center bg-brand-50 text-brand-600 shrink-0">
                  <f.Icon size={20} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink">{f.t}</div>
                  <div className="text-[11px] text-slate-500">{f.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
