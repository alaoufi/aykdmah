import { useEffect, useState } from 'react';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listCategories, listMatchingProviders, listCities, listDistricts } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';
import Avatar from '../common/Avatar';
import { useAuth } from '../../hooks/useAuth';
import { canRequestService } from '../../utils/canRequest';
import { listDirectoryIds, saveToDirectory, contactDirect } from '../../services/requestService';
import { apiError } from '../../services/api';

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

// On a request page (fixedArea + onContact) the list is that request's area and profession,
// only providers working right now, each with a "Contact" button.
export default function MatchingProviders({ categoryId: fixedCategory = '', serviceId = '', showChips = true, title, fixedArea = null, onContact = null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(fixedCategory ? String(fixedCategory) : '');
  const [result, setResult] = useState(null);
  const [browse, setBrowse] = useState(readBrowse);
  const pick = value => { writeBrowse(value); setBrowse(value); };

  useEffect(() => { if (showChips) listCategories().then(setCategories).catch(() => {}); }, [showChips]);
  useEffect(() => { setCategoryId(fixedCategory ? String(fixedCategory) : ''); }, [fixedCategory]);
  // A new provider, or one who starts or stops working, shows up on its own (AYK-078).
  const [tick, quiet] = useLiveRefresh(['providers:changed']);
  useEffect(() => {
    let alive = true;
    if (!quiet) setResult(null);
    const area = fixedArea || browse;
    listMatchingProviders({ categoryId, serviceId, cityId: area?.city_id, districtId: area?.district_id })
      .then(data => { if (alive) setResult(onContact ? { ...data, providers: data.providers.filter(p => p.availability?.state === 'available') } : data); })
      .catch(() => { if (alive) setResult({ area: null, providers: [] }); });
    return () => { alive = false; };
  }, [categoryId, serviceId, browse, fixedArea?.city_id, fixedArea?.district_id, Boolean(onContact), tick]);

  // A requester can keep a provider in "My directory" and contact them directly (AYK-041).
  const { user } = useAuth();
  const requester = Boolean(user) && canRequestService(user) && !onContact;
  const [saved, setSaved] = useState(() => new Set());
  useEffect(() => { if (requester) listDirectoryIds().then(ids => setSaved(new Set(ids))).catch(() => {}); }, [requester]);
  const toggleSaved = async id => {
    const next = !saved.has(id);
    await saveToDirectory(id, next);
    setSaved(previous => { const copy = new Set(previous); if (next) copy.add(id); else copy.delete(id); return copy; });
  };
  const availableCount = result?.providers?.filter(p => p.availability?.state === 'available').length || 0;
  // The requester's own list (AYK-055): available now in the district; if none, available now in
  // the city with a "not covered" note. On a request page (onContact) the list stays as it was.
  const isAvailable = p => p.availability?.state === 'available';
  const cityList = result?.city_providers || null;
  const nowInDistrict = (result?.providers || []).filter(isAvailable);
  const widened = !onContact && cityList !== null && nowInDistrict.length === 0;
  const shown = onContact || cityList === null ? (result?.providers || []) : widened ? cityList.filter(isAvailable) : nowInDistrict;
  const districtName = result?.area ? localizedName({ name_ar: result.area.district_name_ar, name_en: result.area.district_name_en }, lang) : '';
  const cityName = result?.area ? localizedName({ name_ar: result.area.city_name_ar, name_en: result.area.city_name_en }, lang) : '';
  return (
    <div data-testid="providers-for-me">
      <div className="mb-3">
        <h2 className="text-xl md:text-2xl font-extrabold text-fg m-0">👷 {title || t('for_you.providers_title')}</h2>
        {!fixedArea && <div className="mt-1"><AreaLine area={result?.area} browsing={Boolean(browse)} onPick={pick} /></div>}
      </div>
      {/* The professions as a drop-down list (AYK-041). */}
      {showChips && <select className="select mb-3 max-w-md" aria-label={t('for_you.profession')} data-testid="profession-select"
        value={categoryId} onChange={e => setCategoryId(e.target.value)}>
        <option value="">{t('requester.all_professions')}</option>
        {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {localizedName(c, lang)}</option>)}
      </select>}
      {result?.area && result.providers.length > 0 && <div className="flex flex-wrap gap-2 mb-3 text-[13px]" data-testid="providers-stats">
        <span className="px-3 py-1 rounded-pill bg-surface-alt font-semibold">👷 {t('requester.stat_total', { count: result.providers.length })}</span>
        <span className="px-3 py-1 rounded-pill bg-success-soft text-success font-semibold">● {t('requester.stat_available', { count: availableCount })}</span>
      </div>}
      {result === null ? <p className="text-fg-muted">{t('common.loading')}</p>
        : !result.area ? <p className="card text-fg-muted text-[14px]">{t('for_you.no_area_hint')} <Link to="/profile#my-area" className="font-semibold text-primary">{t('for_you.edit_area')}</Link></p>
          : (
            <>
              {widened && (
                <p className="card p-3 text-[13.5px] bg-amber-50 text-amber-900 mb-3" role="status" data-testid="district-not-covered">
                  ⚠️ {t(shown.length ? 'for_you.district_not_covered' : 'for_you.city_none_now', { district: districtName, city: cityName })}
                </p>
              )}
              {shown.length === 0 ? (
                <div className="card text-[14px]">
                  <p className="text-fg-muted m-0 mb-3">{t(cityList === null ? 'for_you.providers_empty' : 'for_you.request_and_we_alert')}</p>
                  {!onContact && <Link to="/requests/new" className="btn btn-primary">{t('home.new_request')}</Link>}
                </div>
              ) : (
                <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
                  {shown.map(p => <ProviderCard key={p.id} provider={p} onContact={onContact}
                    requester={requester} saved={saved.has(p.id)} onToggleSaved={toggleSaved} categoryId={categoryId} />)}
                </ol>
              )}
              {!onContact && cityList?.length > 0 && (
                <CityBox providers={cityList} cityName={cityName} requester={requester} categoryId={categoryId} />
              )}
            </>
          )}
    </div>
  );
}

// Everyone serving the requester's city, small and scrollable (AYK-055): a provider from
// another district may still agree to come, so each row can be contacted directly.
function CityBox({ providers, cityName, requester, categoryId }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [busy, setBusy] = useState(0);
  const [problem, setProblem] = useState('');
  const contact = async id => {
    setBusy(id); setProblem('');
    try { const res = await contactDirect(id, categoryId); navigate(`/chat/${res.conversation_id}`); }
    catch (err) { setProblem(apiError(err)); } finally { setBusy(0); }
  };
  return (
    <section className="card tone-provider p-3 mt-4" data-testid="city-providers">
      <h3 className="text-[15px] font-bold m-0">👥 {t('for_you.city_box_title', { city: cityName, count: providers.length })}</h3>
      <p className="text-[12.5px] text-fg-muted mt-1 mb-2">{t('for_you.city_box_hint')}</p>
      <ul className="list-none p-0 m-0 max-h-64 overflow-y-auto divide-y divide-border">
        {providers.map(p => (
          <li key={p.id} className="flex items-center gap-2 py-2 text-[13px]" data-testid="city-provider">
            <span className={p.availability?.state === 'available' ? 'text-success' : 'text-fg-subtle'} aria-label={t(p.availability?.state === 'available' ? 'for_you.available' : 'for_you.unavailable')}>●</span>
            <Link to={`/providers/${p.id}`} className="font-semibold text-fg truncate">{p.business_name || p.full_name}</Link>
            <span className="text-fg-muted truncate flex-1">
              {p.category_name_ar ? localizedName({ name_ar: p.category_name_ar, name_en: p.category_name_en, name_translations: p.category_name_translations }, lang) : ''}
              {p.district_name_ar ? ` · ${localizedName({ name_ar: p.district_name_ar, name_en: p.district_name_en }, lang)}` : ''}
            </span>
            {requester && <button type="button" className="btn btn-outline btn-sm shrink-0" disabled={busy !== 0} onClick={() => contact(p.id)}>
              {busy === p.id ? '⏳' : `💬 ${t('request.contact')}`}</button>}
          </li>
        ))}
      </ul>
      {problem && <p role="alert" className="form-error mt-1 text-[12px]">{problem}</p>}
    </section>
  );
}

function ProviderCard({ provider: p, onContact, requester = false, saved = false, onToggleSaved, categoryId }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const run = async action => { setBusy(true); setProblem(''); try { await action(); } catch (err) { setProblem(apiError(err)); } finally { setBusy(false); } };
  const state = p.availability?.state;
  return (
    // Providers are blue, requests orange, as in the logo (AYK-099).
    <li className={`card tone-provider p-3 flex gap-3 items-start ${p.is_featured ? 'ring-2 ring-amber-400' : ''}`} data-testid="provider-card">
      <Avatar src={p.avatar} name={p.business_name || p.full_name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/providers/${p.id}`} className="font-bold text-fg truncate">{p.business_name || p.full_name}</Link>
          {p.is_featured && <span className="px-2 py-0.5 rounded-pill bg-amber-100 text-amber-800 text-[11px] font-bold">👑 {t('for_you.featured')}</span>}
          {p.is_verified && <span className="text-[11px] text-success font-semibold">✓ {t('for_you.verified')}</span>}
        </div>
        <div className="text-[13px] text-fg-muted mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {p.category_name_ar && <span>🛠️ {localizedName({ name_ar: p.category_name_ar, name_en: p.category_name_en, name_translations: p.category_name_translations }, lang)}</span>}
          {p.district_name_ar && <span>📍 {localizedName({ name_ar: p.district_name_ar, name_en: p.district_name_en }, lang)}</span>}
          <span>⭐ {p.rating_count ? `${p.rating_avg.toFixed(1)} (${p.rating_count})` : t('for_you.no_ratings')}</span>
          {p.completed_orders > 0 && <span>✅ {t('for_you.completed', { count: p.completed_orders })}</span>}
          <span className={state === 'available' ? 'text-success' : ''}>● {t(state === 'available' ? 'for_you.available' : 'for_you.unavailable')}</span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          {onContact && <button type="button" className="btn btn-primary btn-sm" disabled={busy} data-testid="contact-provider"
            onClick={async () => { setBusy(true); try { await onContact(p); } finally { setBusy(false); } }}>💬 {t('request.contact')}</button>}
          {requester && <button type="button" className="btn btn-primary btn-sm" disabled={busy} data-testid="direct-contact"
            onClick={() => run(async () => { const res = await contactDirect(p.id, categoryId); navigate(`/chat/${res.conversation_id}`); })}>💬 {t('requester.contact_direct')}</button>}
          {requester && (saved
            ? <span className="text-[13px] font-semibold text-fg-muted" data-testid="provider-in-directory">⭐ {t('requester.in_directory')}</span>
            : <button type="button" className="text-[13px] font-semibold text-primary" disabled={busy} data-testid="save-provider"
              onClick={() => run(() => onToggleSaved(p.id))}>☆ {t('requester.add_directory')}</button>)}
          <Link to={`/providers/${p.id}`} className="text-[13px] font-semibold text-primary">{t('for_you.view_profile')}</Link>
        </div>
        {problem && <p role="alert" className="form-error mt-1 text-[12px]">{problem}</p>}
      </div>
    </li>
  );
}
