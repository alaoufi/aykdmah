import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests } from '../../services/requestService';
import { listCategories } from '../../services/serviceService';
import RequestCard from './RequestCard';
import { localizedName } from '../../utils/localize';

export default function Latest({ position }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    listCategories().then(rows => { if (current) setCategories(rows); }).catch(() => {});
    return () => { current = false; };
  }, []);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    const params = { limit: 12, status: 'open' };
    if (filter) params.category_id = filter;
    if (position) { params.latitude = position.latitude; params.longitude = position.longitude; }
    listNearbyRequests(params)
      .then(res => { if (current) setItems(res.data || []); })
      .catch(() => { if (current) { setItems([]); setError(true); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [position, filter]);
  return (
    <section className="py-4 md:py-8" data-testid="latest-requests">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="text-fg text-xl md:text-2xl font-extrabold m-0">{t('home.latest_title')}</h2>
          <Link to={filter ? `/services?category=${filter}` : '/services'} className="text-primary font-semibold text-sm">{t('home.view_all')}</Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <label htmlFor="latest-service-filter" className="text-sm font-bold">{t('request.service')}</label>
          <select id="latest-service-filter" className={`select flex-1 min-w-0 max-w-sm ${error ? 'border-danger' : ''}`}
            value={filter} onChange={e => setFilter(e.target.value)} aria-invalid={error || undefined}
            aria-describedby={error ? 'latest-filter-error' : undefined}>
            <option value="">{t('common.all')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
          </select>
        </div>
        {error && <p id="latest-filter-error" role="alert" className="text-danger text-sm mb-2">{t('errors.generic')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2" aria-busy={loading}>
          {loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-28 rounded-card bg-surface-alt animate-pulse" />)
            : !items.length ? <p className="col-span-full text-center py-4 text-fg-muted">{!error && t('common.none')}</p>
              : items.map(item => <RequestCard key={item.id} item={item} />)}
        </div>
      </div>
    </section>
  );
}
