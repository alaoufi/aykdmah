import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useAuth } from '../../hooks/useAuth';
import useCountry from '../../hooks/useCountry';
import useLocationOptions from '../../hooks/useLocationOptions';
import { IconPin, IconSearch, IconChev, IconPlus } from '../common/Icons';
import { localizedName } from '../../utils/localize';
import { listRegions, listCities, listGovernorates, listDistricts } from '../../services/serviceService';
import { readCatalogFilters, readRememberedCatalogSearch, validateCatalogLocation, findLocationRow } from '../../utils/catalogFilters';

const POPULAR_BY_LANG = {
  ar: ['سباكة', 'كهرباء', 'غسيل الحوش'],
  en: ['Plumbing', 'Electrical', 'Yard cleaning'],
  ur: ['پلمبنگ', 'بجلی', 'صحن کی صفائی'],
  bn: ['প্লাম্বিং', 'বৈদ্যুতিক কাজ', 'উঠান পরিষ্কার'],
  hi: ['प्लंबिंग', 'बिजली का काम', 'आंगन की सफाई'],
};

export default function Hero() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { request: requestLocation, loading: locLoading, position } = useGeolocation();
  const { user } = useAuth();
  // country resolves to: user.country_id → localStorage → first country
  // (Saudi by sort_order). So a guest who hasn't picked anything lands
  // on Saudi regions — exactly what we want.
  const { country } = useCountry();
  const lang = i18n.resolvedLanguage || 'ar';
  const popular = POPULAR_BY_LANG[lang] || POPULAR_BY_LANG.ar;

  const [regionId, setRegionId] = useState('');
  const [governorateId, setGovernorateId] = useState('');
  const [cityId, setCityId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [query, setQuery] = useState('');
  const restoreVersion = useRef(0);
  const restoredOnce = useRef(false);
  const { rows: regions, loading: regionsLoading } = useLocationOptions('regions', country?.id);
  const { rows: governorates, loading: governoratesLoading } = useLocationOptions('governorates', regionId);
  const { rows: cities, loading: citiesLoading } = useLocationOptions(
    governorateId ? 'cities' : 'regionCities', governorateId || regionId,
  );
  const { rows: districts, loading: districtsLoading, error: districtsError } = useLocationOptions('districts', cityId);

  // Restore the last validated discovery context when returning Home. Fetch
  // the active hierarchy before applying it; a stale/edited ID is never used
  // as a fallback option. Manual selection invalidates any pending restore.
  useEffect(() => {
    const version = ++restoreVersion.current;
    setRegionId(''); setGovernorateId(''); setCityId(''); setDistrictId('');
    if (!country?.id || restoredOnce.current) return undefined;
    let alive = true;
    const previous = readCatalogFilters(readRememberedCatalogSearch());
    if (!previous.region && !previous.city && !previous.governorate && !previous.district) {
      restoredOnce.current = true;
      setQuery(previous.q);
      return undefined;
    }
    Promise.all([listRegions({ countryId: country.id }), listCities()]).then(async ([activeRegions, activeCities]) => {
      if (!alive || version !== restoreVersion.current) return;
      const city = findLocationRow(activeCities, previous.city);
      const inferred = city?.region_id || activeCities.find(row => String(row.governorate_id) === previous.governorate)?.region_id;
      const effectiveRegion = previous.region || (inferred ? String(inferred) : '');
      const [activeGovernorates, activeDistricts] = await Promise.all([
        effectiveRegion ? listGovernorates(effectiveRegion) : Promise.resolve([]),
        city ? listDistricts(city.id) : Promise.resolve([]),
      ]);
      if (!alive || version !== restoreVersion.current) return;
      restoredOnce.current = true;
      if (!validateCatalogLocation(previous, { regions: activeRegions, cities: activeCities, governorates: activeGovernorates, districts: activeDistricts })) return;
      setRegionId(effectiveRegion); setGovernorateId(previous.governorate);
      setCityId(previous.city); setDistrictId(previous.district); setQuery(previous.q);
    }).catch(() => {});
    return () => { alive = false; };
  }, [country?.id]);

  const cancelRestore = () => { restoreVersion.current += 1; };
  const pickRegion = (id) => { cancelRestore(); setRegionId(id); setGovernorateId(''); setCityId(''); setDistrictId(''); };
  const pickGovernorate = (id) => { cancelRestore(); setGovernorateId(id); setCityId(''); setDistrictId(''); };
  const pickCity = (id) => { cancelRestore(); setCityId(id); setDistrictId(''); };

  const onSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (regionId) params.set('region', regionId);
    if (governorateId) params.set('governorate', governorateId);
    if (cityId) params.set('city', cityId);
    if (districtId) params.set('district', districtId);
    if (query.trim()) params.set('q', query.trim());
    navigate(`/services${params.size ? `?${params.toString()}` : ''}`);
  };

  return (
    <section className="relative grad-hero overflow-hidden">
      <span className="blob" style={{ width: 420, height: 420, top: -120, right: -80, background: 'rgb(var(--color-accent-soft))' }} />
      <span className="blob" style={{ width: 520, height: 520, bottom: -260, left: -100, background: 'rgb(var(--color-primary-soft))' }} />

      <div className="relative max-w-7xl mx-auto px-3 md:px-6 lg:px-8 pt-5 pb-7 md:pt-16 md:pb-24 lg:pt-20 lg:pb-28">
        {/* Trust pill */}
        <div className="flex items-center justify-center mb-3 md:mb-7">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-pill bg-white/15 backdrop-blur-md border border-white/25 text-white text-[13px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-sand-200 pulse-dot inline-block" />
            {t('home.trust_pill')}
          </div>
        </div>

        {/* Headline */}
        <h1
          className="text-white text-center font-extrabold tracking-tight leading-[1.2] text-[26px] sm:text-5xl lg:text-[64px]"
          style={{ textShadow: '0 2px 12px rgba(0,0,0,.25)' }}
        >
          {t('home.headline_1')}
          <br />
          <span className="bg-gradient-to-l from-white via-white to-white/90 bg-clip-text text-transparent">
            {t('home.headline_2')}
          </span>
        </h1>
        <p
          className="mt-4 md:mt-6 text-center text-white text-base md:text-lg lg:text-xl max-w-2xl mx-auto"
          style={{ textShadow: '0 1px 6px rgba(0,0,0,.30)' }}
        >
          {t('home.subtitle')}
        </p>

        {/* Guest registration nudge — tells them WHY signing up makes the
            search better (region-aware results). Hidden once logged in. */}
        {!user && (
          <div className="mt-4 md:mt-8 mx-auto max-w-5xl bg-white/15 backdrop-blur-md border border-white/25 rounded-card px-4 py-2.5 md:px-5 md:py-3 flex flex-wrap items-center justify-center gap-2.5 text-center">
            <span className="text-[18px]">📍</span>
            <p className="text-white text-[13px] md:text-[14px] font-medium m-0">
              {t('home.register_nudge')}
            </p>
            <Link to="/register" className="px-4 py-1.5 rounded-pill bg-white text-primary text-[13px] font-bold no-underline shadow-soft hover:shadow-lift transition">
              {t('auth.register_button')}
            </Link>
          </div>
        )}

        {/* Search box */}
        <form
          onSubmit={onSearch}
          className="mt-4 md:mt-5 mx-auto max-w-5xl bg-surface rounded-[22px] shadow-hero p-3 md:p-3.5"
        >
          {/* Row 1: 4 location dropdowns (Region → Governorate → City → District) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-2.5">
            <label className="relative flex items-center gap-2 px-3 py-2.5 rounded-card bg-surface-alt hover:bg-primary-soft transition cursor-pointer">
              <IconPin size={16} className="text-primary shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] text-fg-subtle font-medium">{t('location.region')}</span>
                <select
                  value={regionId}
                  onChange={(e) => pickRegion(e.target.value)}
                  disabled={regionsLoading || regions.length === 0}
                  className="bg-transparent text-[14px] font-semibold text-fg outline-none cursor-pointer appearance-none w-full"
                >
                  <option value="">
                    {regionsLoading ? t('common.loading') : t('home.available_regions')}
                  </option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{localizedName(r, lang)}</option>
                  ))}
                </select>
              </div>
              <IconChev size={12} className="text-fg-subtle rotate-90 shrink-0" />
            </label>

            <label className="relative flex items-center gap-2 px-3 py-2.5 rounded-card bg-surface-alt hover:bg-primary-soft transition cursor-pointer">
              <span className="w-[16px] h-[16px] rounded-md border-2 border-primary shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] text-fg-subtle font-medium">{t('location.governorate')}</span>
                <select
                  value={governorateId}
                  onChange={(e) => pickGovernorate(e.target.value)}
                  disabled={!regionId || governoratesLoading || governorates.length === 0}
                  className="bg-transparent text-[14px] font-semibold text-fg outline-none cursor-pointer appearance-none w-full disabled:opacity-60"
                >
                  <option value="">{governoratesLoading ? t('common.loading') : t('location.all_governorates')}</option>
                  {governorates.map((g) => (
                    <option key={g.id} value={g.id}>{localizedName(g, lang)}</option>
                  ))}
                </select>
              </div>
              <IconChev size={12} className="text-fg-subtle rotate-90 shrink-0" />
            </label>

            <label className="relative flex items-center gap-2 px-3 py-2.5 rounded-card bg-surface-alt hover:bg-primary-soft transition cursor-pointer">
              <span className="w-[16px] h-[16px] rounded-full border-2 border-accent shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] text-fg-subtle font-medium">{t('location.city')}</span>
                <select
                  value={cityId}
                  onChange={(e) => pickCity(e.target.value)}
                  disabled={!regionId || citiesLoading || cities.length === 0}
                  className="bg-transparent text-[14px] font-semibold text-fg outline-none cursor-pointer appearance-none w-full disabled:opacity-60"
                >
                  <option value="">{citiesLoading ? t('common.loading') : t('location.all_cities')}</option>
                  {cities.map((c) => (
                    <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>
                  ))}
                </select>
              </div>
              <IconChev size={12} className="text-fg-subtle rotate-90 shrink-0" />
            </label>

            <label className="relative flex items-center gap-2 px-3 py-2.5 rounded-card bg-surface-alt hover:bg-primary-soft transition cursor-pointer">
              <span className="w-[16px] h-[16px] rounded-md bg-accent-soft border border-accent shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[11px] text-fg-subtle font-medium">{t('location.district')}</span>
                <select
                  value={districtId}
                  onChange={(e) => { cancelRestore(); setDistrictId(e.target.value); }}
                  disabled={!cityId || districtsLoading || districts.length === 0}
                  className="bg-transparent text-[14px] font-semibold text-fg outline-none cursor-pointer appearance-none w-full disabled:opacity-60"
                >
                  <option value="">{districtsLoading ? t('common.loading') : districtsError ? t('location.options_unavailable') : cityId && districts.length === 0 ? t('location.no_districts') : t('location.all_districts')}</option>
                  {districts.map((d) => (
                    <option key={d.id} value={d.id}>{localizedName(d, lang)}</option>
                  ))}
                </select>
              </div>
              <IconChev size={12} className="text-fg-subtle rotate-90 shrink-0" />
            </label>
          </div>

          {/* Row 2: Search input + submit button */}
          <div className="mt-2 md:mt-2.5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 md:gap-2.5">
            <label className="relative flex items-center gap-2 px-3.5 py-3 md:py-2.5 rounded-card bg-surface-alt focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/20 transition">
              <IconSearch size={18} className="text-fg-subtle shrink-0" />
              <input
                value={query}
                onChange={(e) => { cancelRestore(); setQuery(e.target.value); }}
                placeholder={t('home.search_placeholder')}
                className="bg-transparent text-[15px] text-fg placeholder:text-fg-subtle outline-none w-full"
              />
            </label>

            <button
              type="submit"
              className="rounded-card px-6 py-3 md:py-2.5 text-white text-[15px] font-bold shadow-soft hover:shadow-lift transition active:scale-[.98] flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
            >
              <IconSearch size={18} />
              {t('common.search')}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 mt-3 px-1 text-[12px]">
            <span className="text-fg-subtle">{t('home.popular')}</span>
            {popular.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { cancelRestore(); setQuery(c); }}
                className="px-2.5 py-1 rounded-pill bg-surface-alt hover:bg-primary-soft hover:text-primary text-fg-muted font-medium transition"
              >
                {c}
              </button>
            ))}
          </div>
        </form>

        {/* Secondary buttons */}
        <div className="mt-5 md:mt-6 flex flex-wrap items-center justify-center gap-2.5 md:gap-3">
          <button
            onClick={() => requestLocation().catch(() => {})}
            disabled={locLoading}
            className="inline-flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-pill bg-white/15 hover:bg-white/25 backdrop-blur-md border border-white/30 text-white text-[14px] font-semibold transition disabled:opacity-50"
          >
            <IconPin size={16} />
            {locLoading ? t('home.locating') : position ? t('home.location_acquired') : t('home.use_my_location')}
          </button>
          <button
            onClick={() => navigate('/requests/new')}
            className="inline-flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-pill bg-surface text-fg text-[14px] font-bold shadow-soft hover:shadow-lift transition"
          >
            <IconPlus size={16} />
            {t('home.new_request')}
          </button>
        </div>

        {/* Launch features */}
        <div className="mt-10 md:mt-14 grid grid-cols-3 gap-2 md:gap-4 max-w-3xl mx-auto">
          {[
            { n: t('home.launch_scope'), l: t('home.launch_scope_label') },
            { n: t('home.launch_offers'), l: t('home.launch_offers_label') },
            { n: t('home.launch_contact'), l: t('home.launch_contact_label') },
          ].map((s, i) => (
            <div key={i} className="text-center text-white">
              <div className="text-2xl md:text-3xl font-extrabold">{s.n}</div>
              <div className="text-white/75 text-[12px] md:text-sm mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
