import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listCategories, listMatchingProviders, listCities, listDistricts } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';
import Avatar from '../common/Avatar';

// Providers who serve the signed-in requester's registered district in a profession
// (AYK-035): every provider covering that district, featured (paid) first, then by
// rating. With showChips the requester picks the profession; otherwise it is fixed.
// A requester managing several homes can look at another neighbourhood without changing
// their registered one; the choice is remembered on this device only.
const BROWSE_KEY = 'ayk_browse_area';
const readBrowse = () => { try { return JSON.parse(localStorage.getItem(BROWSE_KEY) || 'null'); } catch (_) { return null; } };
const writeBrowse = value => { try { value ? localStorage.setItem(BROWSE_KEY, JSON.stringify(value)) : localStorage.removeItem(BROWSE_KEY); } catch (_) { /* private mode */ } };

export function AreaLine({ area, browsing, onPick }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [cityId, setCityId] = useState('');
  const name = area ? [localizedName({ name_ar: area.district_name_ar, name_en: area.district_name_en }, lang), localizedName({ name_ar: area.city_name_ar, name_en: area.city_name_en }, lang)].filter(Boolean).join('، ') : '';
  useEffect(() => { if (open && !cities.length) listCities().then(setCities).catch(() => {}); }, [open, cities.length]);
  useEffect(() => { setDistricts([]); if (cityId) listDistricts(cityId).then(setDistricts).catch(() => {}); }, [cityId]);
  const sel = 'px-3 py-2 rounded-card border border-border bg-surface text-[13px] text-fg min-w-0';
  return (
    <div className="text-[13px] text-fg-muted">
      <p className="m-0">
        📍 {name ? t(browsing ? 'for_you.browsing_area' : 'for_you.your_area', { area: name }) : t('for_you.no_area')}{' '}
        {onPick && <button type="button" className="font-semibold text-primary me-2" onClick={() => setOpen(v => !v)} aria-expanded={open}>🏠 {t('for_you.other_district')}</button>}
        {browsing && onPick && <button type="button" className="font-semibold text-primary me-2" onClick={() => onPick(null)}>↩ {t('for_you.back_to_mine')}</button>}
        <Link to="/profile#my-area" className="font-semibold text-primary">{t('for_you.edit_area')}</Link>
      </p>
      {open && onPick && (
        <div className="flex flex-wrap gap-2 mt-2" data-testid="other-district">
          <select aria-label={t('location.city')} className={sel} value={cityId} onChange={e => setCityId(e.target.value)}>
            <option value="">{t('location.city')}</option>
            {cities.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
          </select>
          <select aria-label={t('location.district')} className={sel} value="" disabled={!cityId}
            onChange={e => { if (e.target.value) { onPick({ city_id: Number(cityId), district_id: Number(e.target.value) }); setOpen(false); } }}>
            <option value="">{cityId && !districts.length ? t('location.no_districts') : t('location.district')}</option>
            {districts.map(d => <option key={d.id} value={d.id}>{localizedName(d, lang)}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

export default function MatchingProviders({ categoryId: fixedCategory = '', serviceId = '', showChips = true, title }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(fixedCategory ? String(fixedCategory) : '');
  const [result, setResult] = useState(null);
  const [browse, setBrowse] = useState(readBrowse);
  const pick = value => { writeBrowse(value); setBrowse(value); };

  useEffect(() => { if (showChips) listCategories().then(setCategories).catch(() => {}); }, [showChips]);
  useEffect(() => { setCategoryId(fixedCategory ? String(fixedCategory) : ''); }, [fixedCategory]);
  useEffect(() => {
    let alive = true;
    setResult(null);
    listMatchingProviders({ categoryId, serviceId, cityId: browse?.city_id, districtId: browse?.district_id }).then(data => { if (alive) setResult(data); })
      .catch(() => { if (alive) setResult({ area: null, providers: [] }); });
    return () => { alive = false; };
  }, [categoryId, serviceId, browse]);

  const chip = active => `px-3 py-1.5 rounded-pill text-[13px] font-semibold border transition ${active ? 'bg-primary text-primary-fg border-primary' : 'bg-surface text-fg-muted border-border hover:bg-surface-alt'}`;
  return (
    <div data-testid="providers-for-me">
      <div className="mb-3">
        <h2 className="text-xl md:text-2xl font-extrabold text-fg m-0">👷 {title || t('for_you.providers_title')}</h2>
        <div className="mt-1"><AreaLine area={result?.area} browsing={Boolean(browse)} onPick={pick} /></div>
      </div>
      {showChips && <div className="flex gap-2 overflow-x-auto pb-2 mb-3" role="radiogroup" aria-label={t('for_you.profession')}>
        <button type="button" role="radio" aria-checked={!categoryId} className={chip(!categoryId)} onClick={() => setCategoryId('')}>{t('common.all')}</button>
        {categories.map(c => (
          <button key={c.id} type="button" role="radio" aria-checked={String(categoryId) === String(c.id)} className={`${chip(String(categoryId) === String(c.id))} whitespace-nowrap`}
            onClick={() => setCategoryId(String(c.id))}>
            {c.icon} {localizedName(c, lang)}
          </button>
        ))}
      </div>}
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
