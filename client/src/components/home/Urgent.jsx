import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests } from '../../services/requestService';
import { IconBolt, IconChevL } from '../common/Icons';
import RequestCard from './RequestCard';

export default function Urgent({ position }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = { limit: 8, status: 'open' };
    if (position) { params.latitude = position.latitude; params.longitude = position.longitude; }
    listNearbyRequests(params)
      .then((res) => {
        const urgent = (res.data || []).filter((r) => r.is_urgent).slice(0, 4);
        setItems(urgent);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [position]);

  if (!loading && items.length === 0) return null;

  return (
    <section className="py-14 md:py-20">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6 md:mb-8 gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-rose-50 text-rose-600 text-[12px] font-bold mb-2">
              <IconBolt size={14} />
              {t('home.urgent_title')}
            </div>
            <h2 className="text-ink text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight">
              {t('home.urgent_title')}
            </h2>
            <p className="text-slate-500 text-sm md:text-[15px] mt-1.5">
              {t('home.urgent_subtitle')}
            </p>
          </div>
          <Link
            to="/services"
            className="hidden md:inline-flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-semibold text-sm no-underline"
          >
            {t('home.view_all')}
            <IconChevL size={16} />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[210px] rounded-card bg-white border border-slate-100 animate-pulse" />
              ))
            : items.map((it) => <RequestCard key={it.id} item={it} urgent />)}
        </div>
      </div>
    </section>
  );
}
