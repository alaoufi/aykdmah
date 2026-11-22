import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listCategories, listServices, listMatchingProviders } from '../../services/serviceService';
import { listNearbyRequests } from '../../services/requestService';
import { getCategoryIcon } from '../common/Icons';
import { localizedName } from '../../utils/localize';
import { localizedJoinedName } from '../../utils/localizeJoined';
import RequestCard from './RequestCard';
import RatingInline from '../reviews/RatingInline';
import ContactButtons from '../providers/ContactButtons';
import RecentActivity from './RecentActivity';
import BoardEmpty from './BoardEmpty';

// AYK-413 (the owner): a visitor browses without signing up. The professions come first, then
// their categories small and close together, then the service requests (no private details are
// sent to a visitor), then every service provider. Chatting needs an account.
export default function GuestHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [category, setCategory] = useState('');
  const [service, setService] = useState('');
  const [requests, setRequests] = useState(null);
  const [providers, setProviders] = useState(null);
  // AYK-441: a profession with nothing yet shows the rest, saying so.
  const [requestsWider, setRequestsWider] = useState(false);
  const [providersWider, setProvidersWider] = useState(false);
  const [allProviders, setAllProviders] = useState(false);

  useEffect(() => {
    listCategories().then(rows => setCategories(rows || [])).catch(() => {});
    listServices().then(rows => setServices(rows || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let current = true;
    setRequests(null);
    const params = { limit: 10, status: 'open' };
    if (category) params.category_id = category;
    if (service) params.service_id = service;
    listNearbyRequests(params)
      .then(async res => {
        let rows = res.data || []; let wider = false;
        if (!rows.length && (category || service)) {
          const all = await listNearbyRequests({ limit: 10, status: 'open' }).catch(() => null);
          rows = all?.data || []; wider = rows.length > 0;
        }
        if (current) { setRequests(rows); setRequestsWider(wider); }
      })
      .catch(() => { if (current) setRequests([]); });
    return () => { current = false; };
  }, [category, service]);

  useEffect(() => {
    let current = true;
    setProviders(null);
    listMatchingProviders({ scope: 'all', categoryId: category || undefined, serviceId: service || undefined })
      .then(async res => {
        let rows = res?.providers || []; let wider = false;
        if (!rows.length && (category || service)) {
          rows = (await listMatchingProviders({ scope: 'all' }).catch(() => null))?.providers || []; wider = rows.length > 0;
        }
        if (current) { setProviders(rows); setProvidersWider(wider); }
      })
      .catch(() => { if (current) setProviders([]); });
    return () => { current = false; };
  }, [category, service]);

  const pickCategory = id => { setCategory(previous => (String(previous) === String(id) ? '' : String(id))); setService(''); };
  const pickService = row => {
    setService(previous => (String(previous) === String(row.id) ? '' : String(row.id)));
    if (row.category_id) setCategory(String(row.category_id));
  };
  const shownServices = category ? services.filter(row => String(row.category_id) === String(category)) : services;
  const shownProviders = (providers || []).slice(0, allProviders ? 100 : 8);

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-3 space-y-4" data-testid="guest-home">
      <div className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 py-2">
        <span className="text-[12.5px] text-fg-muted">💬 {t('home.guest_chat_note')}</span>
        <Link to="/register" className="btn btn-primary btn-sm shrink-0 no-underline">{t('home.guest_register')}</Link>
      </div>

      <section data-testid="guest-professions">
        <h2 className="text-[16px] font-extrabold text-fg mb-2">{t('home.guest_professions')}</h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
          {categories.map(cat => {
            const { Comp, tint, bg } = getCategoryIcon(cat.slug);
            const active = String(category) === String(cat.id);
            return (
              <button key={cat.id} type="button" onClick={() => pickCategory(cat.id)} aria-pressed={active}
                className={`rounded-card border px-1 py-2 flex flex-col items-center gap-1 text-center ${active ? 'border-primary bg-primary-soft' : 'border-border bg-surface'}`}>
                <span className="w-9 h-9 rounded-full grid place-items-center" style={{ background: bg, color: tint }}><Comp size={18} /></span>
                <span className="text-[11.5px] font-bold text-fg leading-tight">{localizedName(cat, lang)}</span>
              </button>
            );
          })}
        </div>
      </section>

      {shownServices.length > 0 && <section data-testid="guest-services">
        <h2 className="text-[14px] font-extrabold text-fg mb-1.5">{t('home.guest_services')}</h2>
        <div className="flex flex-wrap gap-1">
          {shownServices.map(row => {
            const active = String(service) === String(row.id);
            return (
              <button key={row.id} type="button" onClick={() => pickService(row)} aria-pressed={active}
                className={`px-2 py-0.5 rounded-pill border text-[11.5px] ${active ? 'border-primary bg-primary-soft text-primary font-bold' : 'border-border bg-surface-alt text-fg'}`}>
                {localizedName(row, lang)}
              </button>
            );
          })}
        </div>
      </section>}

      <section data-testid="guest-requests">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[16px] font-extrabold text-fg m-0">{t('home.guest_requests')}</h2>
          <Link to={category ? `/opportunities?category=${category}` : '/opportunities'} className="text-primary font-semibold text-[13px]">{t('home.view_all')}</Link>
        </div>
        {requestsWider && <p className="text-[12.5px] rounded-card bg-amber-50 text-amber-900 px-3 py-2 mb-1.5" role="status" data-testid="board-fallback">💡 {t('home.guest_fallback_requests')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" aria-busy={requests === null}>
          {requests === null ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 rounded-card bg-surface-alt animate-pulse" />)
            : !requests.length ? <div className="col-span-full"><BoardEmpty who="guest" /></div>
              : requests.map(item => <RequestCard key={item.id} item={item} />)}
        </div>
        <RecentActivity className="mt-2" />
      </section>

      <section data-testid="guest-providers">
        <h2 className="text-[16px] font-extrabold text-fg mb-1.5">{t('home.guest_providers')}</h2>
        {providersWider && <p className="text-[12.5px] rounded-card bg-amber-50 text-amber-900 px-3 py-2 mb-1.5" role="status" data-testid="providers-fallback">💡 {t('home.guest_fallback_providers')}</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" aria-busy={providers === null}>
          {providers === null ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 rounded-card bg-surface-alt animate-pulse" />)
            : !providers.length ? <div className="col-span-full"><BoardEmpty kind="providers" /></div>
              : shownProviders.map(row => (
                // AYK-435: a visitor sees the contact icons too; the chat asks them to sign in first.
                <div key={row.id} className="tone-provider rounded-card px-2.5 py-2 flex items-center gap-2.5" data-testid="guest-provider">
                  <Link to={`/providers/${row.id}`} className="min-w-0 flex-1 flex items-center gap-2.5 no-underline">
                    {row.avatar
                      ? <img src={row.avatar} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" loading="lazy" />
                      : <span className="w-10 h-10 rounded-full grid place-items-center bg-brand-50 text-[18px] shrink-0" aria-hidden="true">🛠️</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-extrabold text-fg truncate">{row.business_name || row.full_name}</span>
                      <span className="block text-[11.5px] text-fg-muted truncate">
                        {[localizedJoinedName(row, 'category', lang), localizedJoinedName(row, 'district', lang)].filter(Boolean).join(' · ')}
                      </span>
                      {Number(row.rating_count) > 0 && <RatingInline className="text-[11px]" size={11} average={row.rating_avg} count={row.rating_count} showCount={false} />}
                    </span>
                  </Link>
                  <ContactButtons size="xs" testId="guest-contact" phone={row.public_phone} whatsapp={row.public_whatsapp}
                    onChat={() => navigate('/login', { state: { from: `/providers/${row.id}` } })} link={`/providers/${row.id}`} />
                </div>
              ))}
        </div>
        {providers && providers.length > 8 && !allProviders && (
          <button type="button" onClick={() => setAllProviders(true)} className="mt-2 w-full btn btn-outline btn-sm" data-testid="guest-providers-more">
            {t('home.guest_more')} ({providers.length - 8})
          </button>
        )}
      </section>
    </div>
  );
}
