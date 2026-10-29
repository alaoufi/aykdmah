import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MatchingProviders from '../catalog/MatchingProviders';
import DirectoryPage from '../../pages/client/DirectoryPage';

// A signed-in requester's home (AYK-041), with nothing else around it: one button to
// post a request, the professions as a drop-down with how many providers serve the
// area and how many are working now, and their own directory.
export default function RequesterHome() {
  const { t } = useTranslation();
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8 space-y-8" data-testid="requester-home">
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
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
      <DirectoryPage compact />
    </section>
  );
}
