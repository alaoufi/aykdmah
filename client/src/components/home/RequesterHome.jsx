import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MatchingProviders from '../catalog/MatchingProviders';
import WorkRequests from './WorkRequests';
import { useAuth } from '../../hooks/useAuth';
import { canRequestService } from '../../utils/canRequest';

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
const SCOPES = ['area', 'city', 'region', 'all'];

export default function RequesterHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isProvider = user?.role === 'provider';
  const canRequest = canRequestService(user);
  const [tab, setTab] = useState(() => readTab(isProvider));
  const [scope, setScope] = useState('area');
  const choose = next => { setTab(next); try { localStorage.setItem(TAB_KEY, next); } catch (_) { /* private mode */ } };
  const asProviderBoard = tab === 'requests' && isProvider;
  const tabButton = (value, icon, label, hint) => (
    <button type="button" role="tab" aria-selected={tab === value} onClick={() => choose(value)} data-testid={`home-tab-${value}`}
      className={`flex-1 min-w-0 rounded-card px-3 py-2.5 text-start border-2 transition cursor-pointer ${tab === value
        ? (value === 'requests' ? 'tone-request border-primary shadow-soft' : 'tone-provider border-primary shadow-soft')
        : 'bg-surface border-border opacity-80 hover:opacity-100'}`}>
      <span className="block text-[15px] font-extrabold text-fg">{icon} {label}</span>
      <span className="block text-[12px] text-fg-muted mt-0.5">{hint}</span>
    </button>
  );
  const scopeLabel = value => (value === 'area' ? t(asProviderBoard ? 'home.scope_coverage' : 'home.scope_district') : t(`home.scope_${value}`));
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8 space-y-4" data-testid="requester-home">
      <div className="sticky top-[var(--header-h,56px)] z-20 bg-bg/90 backdrop-blur py-1 -mx-1 px-1 space-y-2" data-testid="home-tabs">
        <div role="tablist" className="flex gap-2">
          {tabButton('requests', '🙋', t('home.tab_requests'), t(isProvider ? 'home.tab_requests_hint_provider' : 'home.tab_requests_hint'))}
          {tabButton('providers', '🛠️', t('home.tab_providers'), t('home.tab_providers_hint'))}
        </div>
        {/* The circle: one's own area by default, then wider. */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="radiogroup" aria-label={t('home.scope_label')} data-testid="home-scope">
          <span className="text-[12px] text-fg-muted shrink-0">📍 {t('home.scope_label')}</span>
          {SCOPES.map(value => (
            <button key={value} type="button" role="radio" aria-checked={scope === value} onClick={() => setScope(value)} data-testid={`home-scope-${value}`}
              className={`shrink-0 rounded-full px-3 py-1 text-[12.5px] font-semibold border transition ${scope === value
                ? 'bg-primary text-white border-primary' : 'bg-surface text-fg border-border hover:bg-surface-alt'}`}>
              {scopeLabel(value)}
            </button>
          ))}
        </div>
      </div>
      {tab === 'requests' ? <WorkRequests scope={scope} asProvider={isProvider} /> : (
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
          <MatchingProviders scope={scope} />
        </>
      )}
    </section>
  );
}
