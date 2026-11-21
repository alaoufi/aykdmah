import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MatchingProviders from '../catalog/MatchingProviders';
import WorkRequests from './WorkRequests';
import { useAuth } from '../../hooks/useAuth';

// A signed-in person's home, by who they are (AYK-339, the owner):
// - a requester: the request card, then the providers serving their area;
// - an account that is also a provider: first the requests in their profession and area, then the
//   request card and the providers (those of the professions they asked for come first).
// «دليلي» is no longer repeated here: it opens from the menu and the bottom bar, with its own page.
// AYK-387 (the owner: «أنا كلاهما وتختلط عليّ الطلبات ومقدمو الخدمة. اجعل أعلى الصفحة التنقل بين
// الحالتين: مقدم خدمة يعرض طالبي الخدمة، وطالب خدمة يعرض مقدمي الخدمة»). An account that is both
// picks one at the top; the choice is kept on this device.
const MODE_KEY = 'ayk_home_mode';
const readMode = () => { try { return localStorage.getItem(MODE_KEY) === 'client' ? 'client' : 'provider'; } catch (_) { return 'provider'; } };

export default function RequesterHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const both = user?.role === 'provider';
  const [mode, setMode] = useState(readMode);
  const choose = next => { setMode(next); try { localStorage.setItem(MODE_KEY, next); } catch (_) { /* private mode */ } };
  const asProvider = both && mode === 'provider';
  const tab = (value, icon, label, hint) => (
    <button type="button" role="tab" aria-selected={mode === value} onClick={() => choose(value)} data-testid={`home-mode-${value}`}
      className={`flex-1 min-w-0 rounded-card px-3 py-2.5 text-start border-2 transition cursor-pointer ${mode === value
        ? (value === 'provider' ? 'tone-provider border-primary shadow-soft' : 'tone-request border-primary shadow-soft')
        : 'bg-surface border-border opacity-80 hover:opacity-100'}`}>
      <span className="block text-[15px] font-extrabold text-fg">{icon} {label}</span>
      <span className="block text-[12px] text-fg-muted mt-0.5">{hint}</span>
    </button>
  );
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8 space-y-6" data-testid="requester-home">
      {both && (
        <div role="tablist" className="flex gap-2 sticky top-[var(--header-h,56px)] z-20 bg-bg/90 backdrop-blur py-1 -mx-1 px-1" data-testid="home-mode">
          {tab('provider', '🛠️', t('home.mode_provider'), t('home.mode_provider_hint'))}
          {tab('client', '🙋', t('home.mode_client'), t('home.mode_client_hint'))}
        </div>
      )}
      {asProvider ? <WorkRequests /> : (
        <>
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
          <MatchingProviders />
        </>
      )}
    </section>
  );
}
