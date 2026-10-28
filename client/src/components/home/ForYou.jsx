import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { listNearbyRequests } from '../../services/requestService';
import { listCategories, listMatchingProviders } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';
import Avatar from '../common/Avatar';
import RequestCard from './RequestCard';

// The heart of the site (AYK-035): a provider sees open requests in their coverage
// area and professions; a requester sees providers who serve their area in the
// profession they pick, featured (paid) first, then the highest rated.
export default function ForYou() {
  const { user } = useAuth();
  if (!user || !['client', 'provider'].includes(user.role)) return null;
  const isProvider = user.role === 'provider';
  const isClient = user.role === 'client' || Number(user.also_client) === 1;
  return (
    <section className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-6 md:py-10 space-y-10" data-testid="for-you">
      {isProvider && <RequestsForMe />}
      {isClient && <ProvidersForMe />}
    </section>
  );
}

function AreaLine({ area }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const name = area ? [localizedName({ name_ar: area.district_name_ar, name_en: area.district_name_en }, lang), localizedName({ name_ar: area.city_name_ar, name_en: area.city_name_en }, lang)].filter(Boolean).join('، ') : '';
  return (
    <p className="text-[13px] text-fg-muted m-0">
      📍 {name ? t('for_you.your_area', { area: name }) : t('for_you.no_area')}{' '}
      <Link to="/profile#my-area" className="font-semibold text-primary">{t('for_you.edit_area')}</Link>
    </p>
  );
}

function RequestsForMe() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  useEffect(() => {
    listNearbyRequests({ matching: '1', limit: 6 }).then(res => setItems(res.data || [])).catch(() => setItems([]));
  }, []);
  return (
    <div data-testid="requests-for-me">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-fg m-0">🛠️ {t('for_you.requests_title')}</h2>
          <p className="text-[13px] text-fg-muted mt-1 mb-0">{t('for_you.requests_hint')}</p>
        </div>
        <Link to="/provider" className="text-[13px] font-semibold text-primary">{t('for_you.view_all')}</Link>
      </div>
      {items === null ? <p className="text-fg-muted">{t('common.loading')}</p>
        : items.length === 0 ? <p className="card text-fg-muted text-[14px]">{t('for_you.requests_empty')}</p>
          : <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <RequestCard key={item.id} item={item} />)}</div>}
    </div>
  );
}

function ProvidersForMe() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => { listCategories().then(setCategories).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    setResult(null);
    listMatchingProviders({ categoryId }).then(data => { if (alive) setResult(data); })
      .catch(() => { if (alive) setResult({ area: null, providers: [] }); });
    return () => { alive = false; };
  }, [categoryId]);

  const chip = active => `px-3 py-1.5 rounded-pill text-[13px] font-semibold border transition ${active ? 'bg-primary text-primary-fg border-primary' : 'bg-surface text-fg-muted border-border hover:bg-surface-alt'}`;
  return (
    <div data-testid="providers-for-me">
      <div className="mb-3">
        <h2 className="text-xl md:text-2xl font-extrabold text-fg m-0">👷 {t('for_you.providers_title')}</h2>
        <div className="mt-1"><AreaLine area={result?.area} /></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3" role="radiogroup" aria-label={t('for_you.profession')}>
        <button type="button" role="radio" aria-checked={!categoryId} className={chip(!categoryId)} onClick={() => setCategoryId('')}>{t('common.all')}</button>
        {categories.map(c => (
          <button key={c.id} type="button" role="radio" aria-checked={String(categoryId) === String(c.id)} className={`${chip(String(categoryId) === String(c.id))} whitespace-nowrap`}
            onClick={() => setCategoryId(String(c.id))}>
            {c.icon} {localizedName(c, lang)}
          </button>
        ))}
      </div>
      {result === null ? <p className="text-fg-muted">{t('common.loading')}</p>
        : !result.area ? <p className="card text-fg-muted text-[14px]">{t('for_you.no_area_hint')} <Link to="/profile#my-area" className="font-semibold text-primary">{t('for_you.edit_area')}</Link></p>
          : result.providers.length === 0 ? (
            <div className="card text-[14px]">
              <p className="text-fg-muted m-0 mb-3">{t('for_you.providers_empty')}</p>
              <Link to="/requests/new" className="btn btn-primary">{t('home.new_request')}</Link>
            </div>
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
              {result.providers.map(p => <ProviderCard key={p.id} provider={p} />)}
            </ol>
          )}
    </div>
  );
}

function ProviderCard({ provider: p }) {
  const { t } = useTranslation();
  const state = p.availability?.state;
  return (
    <li className={`card p-4 flex gap-3 items-start ${p.is_featured ? 'ring-2 ring-amber-400' : ''}`} data-testid="provider-card">
      <Avatar src={p.avatar} name={p.business_name || p.full_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/providers/${p.id}`} className="font-bold text-fg truncate">{p.business_name || p.full_name}</Link>
          {p.is_featured && <span className="px-2 py-0.5 rounded-pill bg-amber-100 text-amber-800 text-[11px] font-bold">👑 {t('for_you.featured')}</span>}
          {p.is_verified && <span className="text-[11px] text-success font-semibold">✓ {t('for_you.verified')}</span>}
        </div>
        <div className="text-[13px] text-fg-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <span>⭐ {p.rating_count ? `${p.rating_avg.toFixed(1)} (${p.rating_count})` : t('for_you.no_ratings')}</span>
          {p.completed_orders > 0 && <span>✅ {t('for_you.completed', { count: p.completed_orders })}</span>}
          <span className={state === 'available' ? 'text-success' : ''}>● {t(state === 'available' ? 'for_you.available' : 'for_you.unavailable')}</span>
        </div>
        <Link to={`/providers/${p.id}`} className="inline-block mt-2 text-[13px] font-semibold text-primary">{t('for_you.view_profile')}</Link>
      </div>
    </li>
  );
}
