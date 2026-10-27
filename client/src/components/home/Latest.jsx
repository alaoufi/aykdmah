import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests } from '../../services/requestService';
import { listCategories } from '../../services/serviceService';
import { IconChevL, IconChev } from '../common/Icons';
import RequestCard from './RequestCard';
import { localizedName } from '../../utils/localize';

export default function Latest({ position }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    const params = { limit: 12, status: 'open' };
    if (position) { params.latitude = position.latitude; params.longitude = position.longitude; }
    listNearbyRequests(params)
      .then((res) => setItems(res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [position]);

  const filtered = useMemo(() => {
    if (!filter) return items;
    return items.filter((it) => String(it.category_id) === String(filter));
  }, [items, filter]);

  return (
    <section className="py-6 md:py-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6 md:mb-8 gap-4 flex-wrap">
          <div>
            <div className="text-[12px] font-bold text-brand-600 mb-2">{t('home.latest_title')}</div>
            <h2 className="text-ink text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight">
              {t('home.latest_title')}
            </h2>
            <p className="text-slate-500 text-sm md:text-[15px] mt-1.5">
              {t('home.latest_subtitle')}
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

        <div className="flex items-center gap-2 mb-5 md:mb-6 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          <button
            onClick={() => setFilter('')}
            className={`shrink-0 px-4 py-1.5 rounded-pill text-[13px] font-semibold transition border ${
              filter === ''
                ? 'bg-ink text-white border-ink'
                : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-700'
            }`}
          >
            {t('common.all')}
          </button>
          {categories.slice(0, 8).map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`shrink-0 px-4 py-1.5 rounded-pill text-[13px] font-semibold transition border ${
                String(filter) === String(c.id)
                  ? 'bg-ink text-white border-ink'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {localizedName(c, lang)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[210px] rounded-card bg-white border border-slate-100 animate-pulse" />
              ))
            : filtered.length === 0
              ? (
                <div className="col-span-full text-center py-12 text-slate-500">
                  <div className="text-4xl mb-2">📭</div>
                  {t('common.none')}
                </div>
              )
              : filtered.map((it) => <RequestCard key={it.id} item={it} />)}
        </div>

        {filtered.length >= 12 && (
          <div className="mt-8 md:mt-10 flex justify-center">
            <Link
              to="/services"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-pill bg-white border border-slate-200 hover:border-brand-300 hover:text-brand-700 text-slate-700 font-semibold text-sm transition no-underline"
            >
              {t('common.more')}
              <IconChev size={14} className="rotate-90" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
