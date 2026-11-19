import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { listNearbyRequests } from '../../services/requestService';
import MatchingProviders from '../catalog/MatchingProviders';
import MyMarket from '../provider/MyMarket';
import RequestCard from './RequestCard';

// The heart of the site (AYK-035): a provider sees open requests in their coverage
// area and professions; a requester sees providers who serve their area in the
// profession they pick, featured (paid) first, then the highest rated.
export default function ForYou() {
  const { user } = useAuth();
  if (!user || !['client', 'provider'].includes(user.role)) return null;
  const isProvider = user.role === 'provider';
  const isClient = user.role === 'client' || Number(user.also_client) === 1;
  return (
    <section className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-8 space-y-8" data-testid="for-you">
      {isProvider && <MyMarket />}
      {isProvider && <RequestsForMe />}
      {isClient && <MatchingProviders />}
    </section>
  );
}

function RequestsForMe() {
  const { t } = useTranslation();
  const [items, setItems] = useState(null);
  useEffect(() => {
    listNearbyRequests({ matching: '1', limit: 6 }).then(res => setItems(res.data || [])).catch(() => setItems([]));
  }, []);
  return (
    <div data-testid="requests-for-me">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-fg m-0">🛠️ {t('for_you.requests_title')}</h2>
          <p className="text-[13px] text-fg-muted mt-1 mb-0">{t('for_you.requests_hint')}</p>
        </div>
        <Link to="/provider" className="text-[13px] font-semibold text-primary">{t('for_you.view_all')}</Link>
      </div>
      {items === null ? <p className="text-fg-muted">{t('common.loading')}</p>
        : items.length === 0 ? <p className="card text-fg-muted text-[14px]">{t('for_you.requests_empty')}</p>
          : <div className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <RequestCard key={item.id} item={item} />)}</div>}
    </div>
  );
}

