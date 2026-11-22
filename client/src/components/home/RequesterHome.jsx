import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MatchingProviders from '../catalog/MatchingProviders';
import WorkRequests from './WorkRequests';
import { useAuth } from '../../hooks/useAuth';
import { canRequestService } from '../../utils/canRequest';
import usePublicSettings from '../../hooks/usePublicSettings';
import BoardFilters from './BoardFilters';

// A signed-in person's home (AYK-339, AYK-387).
// AYK-397 (the owner: «في الرئيسية في الأعلى: طالبو الخدمة / مقدمو الخدمة. الافتراضي منطقتك وله يوسّع
// الدائرة»). Everyone gets the two tabs at the top: the requests of those asking for a service, and the
// providers. Under them, the circle: one's own area by default (a provider's coverage, a requester's
// district), then the city, the region, or everywhere. The tab is kept on this device; the circle
// starts at one's own area on every visit.
const TAB_KEY = 'ayk_home_tab';
const readTab = isProvider => {
  try {
    const kept = localStorage.getItem(TAB_KEY);
    if (kept === 'requests' || kept === 'providers') return kept;
    const old = localStorage.getItem('ayk_home_mode'); // AYK-387's choice, carried over
    if (old) return old === 'client' ? 'providers' : 'requests';
  } catch (_) { /* private mode */ }
  return isProvider ? 'requests' : 'providers';
};

export default function RequesterHome({ topAd = null }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isProvider = user?.role === 'provider';
  const canRequest = canRequestService(user);
  const [tab, setTab] = useState(() => readTab(isProvider));
  const { settings } = usePublicSettings();
  const restricted = settings.marketplace_restrict_views === true || settings.marketplace_restrict_views === 'true';
  // No filter by default (AYK-440); kept for this visit only.
  const [filters, setFilters] = useState({ prof: false, area: false });
  const board = restricted ? { prof: true, area: true } : filters;
  const [boardMeta, setBoardMeta] = useState(null);
  const choose = next => { setTab(next); try { localStorage.setItem(TAB_KEY, next); } catch (_) { /* private mode */ } };
  // AYK-449 (the owner: «احذف السطر الذي تحتها وقلّل ارتفاعها، وارفعها تحت الهيدر مباشرة»): one line each.
  const tabButton = (value, icon, label) => (
    <button type="button" role="tab" aria-selected={tab === value} onClick={() => choose(value)} data-testid={`home-tab-${value}`}
      className={`flex-1 min-w-0 rounded-card px-3 py-1.5 text-center border-2 transition cursor-pointer whitespace-nowrap ${tab === value
        ? (value === 'requests' ? 'tone-request border-primary shadow-soft' : 'tone-provider border-primary shadow-soft')
        : 'bg-surface border-border opacity-80 hover:opacity-100'}`}>
      <span className="block text-[14.5px] font-extrabold text-fg">{icon} {label}</span>
    </button>
  );
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 pt-0 pb-4 md:pt-2 md:pb-8 space-y-3" data-testid="requester-home">
      <div className="sticky top-[var(--header-h,56px)] z-20 bg-bg/90 backdrop-blur py-1 -mx-1 px-1 space-y-1.5" data-testid="home-tabs">
        <div role="tablist" className="flex gap-2">
          {tabButton('requests', '🙋', t('home.tab_requests'))}
          {tabButton('providers', '🛠️', t('home.tab_providers'))}
        </div>
        {/* AYK-440/444: everyone, ranked by my profession (or my requests) and my area; two boxes narrow it. */}
        <BoardFilters value={filters} onChange={setFilters} asProvider={isProvider} restricted={restricted} meta={boardMeta} />
      </div>
      {topAd}
      {tab === 'requests' ? <WorkRequests board={board} asProvider={isProvider} onMeta={setBoardMeta} /> : (
        <>
          {canRequest && (
            <div className="card tone-request p-4 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-extrabold text-fg m-0">{t('requester.home_title')}</h1>
                <p className="text-[13.5px] text-fg-muted mt-1 mb-0">{t('requester.home_hint')}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Link to="/requests/new" className="btn btn-primary btn-lg" data-testid="requester-new-request">➕ {t('home.new_request')}</Link>
                <Link to="/client" className="btn btn-outline">📋 {t('nav.my_requests')}</Link>
              </div>
            </div>
          )}
          <MatchingProviders board={board} onMeta={setBoardMeta} />
        </>
      )}
    </section>
  );
}
