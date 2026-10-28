import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useAuth } from '../../hooks/useAuth';
import { canRequestService } from '../../utils/canRequest';
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

  // Compact on phones: one-line headline, a single search row, one row of actions,
  // so the user's own area ("For you") starts right below without scrolling far.
  return (
    <section className="relative grad-hero overflow-hidden">
      <span className="blob" style={{ width: 420, height: 420, top: -120, right: -80, background: 'rgb(var(--color-accent-soft))' }} />
      <span className="blob" style={{ width: 520, height: 520, bottom: -260, left: -100, background: 'rgb(var(--color-primary-soft))' }} />

      <div className="relative max-w-3xl mx-auto px-4 md:px-6 pt-4 pb-5 md:pt-12 md:pb-14">
        <h1 className="text-white text-center font-extrabold tracking-tight leading-snug text-[19px] sm:text-3xl lg:text-[44px]"
          style={{ textShadow: '0 2px 10px rgba(0,0,0,.25)' }}>
          {t('home.headline_1')} <span className="text-white/90">{t('home.headline_2')}</span>
        </h1>
        <p className="mt-1.5 md:mt-3 text-center text-white/90 text-[12.5px] md:text-base leading-relaxed" style={{ textShadow: '0 1px 6px rgba(0,0,0,.3)' }}>
          {t('home.subtitle')}
        </p>

        <form onSubmit={onSearch} className="mt-3 md:mt-6 flex items-center gap-1.5 bg-surface rounded-pill shadow-hero p-1.5 ps-3" role="search">
          <IconSearch size={17} className="text-fg-subtle shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('home.search_placeholder')}
            aria-label={t('common.search')}
            className="flex-1 min-w-0 bg-transparent text-[14px] md:text-[15px] text-fg placeholder:text-fg-subtle outline-none py-2"
          />
          <button type="submit" className="shrink-0 rounded-pill px-4 md:px-6 py-2 text-white text-[13.5px] md:text-[15px] font-bold transition active:scale-[.98]"
            style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
            {t('common.search')}
          </button>
        </form>

        <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {canRequestService(user) && <button onClick={() => navigate('/requests/new')}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-pill bg-surface text-fg text-[12.5px] font-bold shadow-soft">
            <IconPlus size={14} /> {t('home.new_request')}
          </button>}
          {popular.map((c) => (
            <button key={c} type="button" onClick={() => setQuery(c)}
              className="shrink-0 px-2.5 py-1 rounded-pill bg-white/15 hover:bg-white/25 border border-white/25 text-white text-[12px] font-medium transition">
              {c}
            </button>
          ))}
          {!user && (
            <button onClick={() => requestLocation().catch(() => {})} disabled={locLoading}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-pill bg-white/15 border border-white/25 text-white text-[12.5px] font-semibold disabled:opacity-50">
              <IconPin size={14} /> {locLoading ? t('home.locating') : position ? t('home.location_acquired') : t('home.use_my_location')}
            </button>
          )}
        </div>

        {!user && (
          <p className="mt-3 text-center text-white/90 text-[12.5px] m-0">
            📍 {t('home.register_nudge')}{' '}
            <Link to="/register" className="font-bold text-white underline underline-offset-2">{t('auth.register_button')}</Link>
          </p>
        )}
      </div>
    </section>
  );
}
