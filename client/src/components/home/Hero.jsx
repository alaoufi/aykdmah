import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useAuth } from '../../hooks/useAuth';
import { IconPin, IconSearch, IconPlus } from '../common/Icons';
import { readCatalogFilters, readRememberedCatalogSearch } from '../../utils/catalogFilters';

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
  const lang = i18n.resolvedLanguage || 'ar';
  const popular = POPULAR_BY_LANG[lang] || POPULAR_BY_LANG.ar;

  const [query, setQuery] = useState('');
  // The region is the one registered on the account (edited from the top bar), so the
  // search box only asks what is needed; the last query is restored when returning.
  useEffect(() => { setQuery(readCatalogFilters(readRememberedCatalogSearch()).q || ''); }, []);

  const onSearch = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
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
          {/* Row 2: Search input + submit button */}
          <div className="mt-2 md:mt-2.5 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 md:gap-2.5">
            <label className="relative flex items-center gap-2 px-3.5 py-3 md:py-2.5 rounded-card bg-surface-alt focus-within:bg-surface focus-within:ring-2 focus-within:ring-primary/20 transition">
              <IconSearch size={18} className="text-fg-subtle shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
                onClick={() => setQuery(c)}
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
