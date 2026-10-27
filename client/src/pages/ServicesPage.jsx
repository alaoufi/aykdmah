import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listCategories, listServices, listCities } from '../services/serviceService';
import { listNearbyRequests } from '../services/requestService';
import RequestCard from '../components/requests/RequestCard';
import { LoadingState, EmptyState } from '../components/common/Spinner';
import { localizedName } from '../utils/localize';
import { useAuth } from '../hooks/useAuth';

export default function ServicesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [cities, setCities] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const { user } = useAuth();
  // Providers chose their services and districts at sign-up: show the matching
  // requests directly, with "All requests" one tap away.
  const isProvider = user?.role === 'provider';
  const canRequest = !isProvider || Number(user?.also_client) === 1;
  const matching = isProvider && params.get('all') !== '1';

  const categoryId = params.get('category') || '';
  const cityId = params.get('city') || '';
  const serviceId = params.get('service') || '';

  useEffect(() => {
    listCategories().then(setCategories).catch(() => {});
    listCities().then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    let current = true;
    setServices([]);
    if (categoryId) listServices(categoryId).then(rows => { if (current) setServices(rows); }).catch(() => {});
    return () => { current = false; };
  }, [categoryId]);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    const q = {};
    if (categoryId) q.category_id = categoryId;
    if (serviceId) q.service_id = serviceId;
    if (cityId) q.city_id = cityId;
    if (matching) q.matching = '1';
    listNearbyRequests(q)
      .then(res => { if (current) setRequests(res.data || []); })
      .catch(() => { if (current) { setRequests([]); setError(true); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [categoryId, serviceId, cityId, matching]);

  const setParam = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'category') next.delete('service');
    setParams(next);
  };

  return (
    <div className="container page">
      <h2 className="mb-4">{t('nav.services')}</h2>
      {error && <p role="alert" className="form-error">{t('errors.generic')}</p>}

      {isProvider && <div className="flex gap-1.5 mb-3" role="tablist">
        {[['1', 'opportunities.matching'], ['', 'opportunities.all']].map(([value, label]) => {
          const active = (value === '1') === matching;
          return <button key={label} type="button" role="tab" aria-selected={active} onClick={() => setParam('all', value === '1' ? '' : '1')}
            className={`px-3 py-1.5 rounded-pill text-[13px] font-semibold border ${active ? 'border-primary bg-primary-soft' : 'border-border bg-surface-alt'}`}>{t(label)}</button>;
        })}
      </div>}
      {!matching && <div className="filters grid grid-3 mb-4">
        <select className="select" value={categoryId} onChange={(e) => setParam('category', e.target.value)}>
          <option value="">{t('common.all')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
        </select>
        <select className="select" value={serviceId} onChange={(e) => setParam('service', e.target.value)} disabled={!categoryId}>
          <option value="">{t('common.all')}</option>
          {services.map(s => <option key={s.id} value={s.id}>{localizedName(s, lang)}</option>)}
        </select>
        <select className="select" value={cityId} onChange={(e) => setParam('city', e.target.value)}>
          <option value="">{t('location.all_cities')}</option>
          {cities.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
        </select>
      </div>}

      <div className="flex justify-between items-center mb-3">
        <div className="text-secondary">{requests.length}</div>
        {canRequest && <Link to="/requests/new" className="btn btn-primary btn-sm">➕ {t('home.new_request')}</Link>}
      </div>

      {loading ? <LoadingState /> :
       requests.length === 0 ? <EmptyState title={t('common.none')} /> :
       <div className="grid grid-2">{requests.map(r => <RequestCard key={r.id} request={r} />)}</div>}
    </div>
  );
}
