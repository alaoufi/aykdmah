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
export default function RequesterHome() {
  const { t } = useTranslation();
  const { user } = useAuth();
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8 space-y-8" data-testid="requester-home">
      {user?.role === 'provider' && <WorkRequests />}
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
    </section>
  );
}
