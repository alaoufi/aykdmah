import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listCategories, listRegions, listMatchingProviders } from '../../services/serviceService';
import { listNearbyRequests } from '../../services/requestService';
import { optionLabel } from '../../utils/optionLabel';
import { localizedName } from '../../utils/localize';
import { localizedJoinedName } from '../../utils/localizeJoined';
import RequestCard from './RequestCard';
import RatingInline from '../reviews/RatingInline';
import ContactButtons from '../providers/ContactButtons';
import RecentActivity from './RecentActivity';
import BoardEmpty from './BoardEmpty';

// AYK-413 (the owner): a visitor browses without signing up; chatting needs an account.
// AYK-467 (the owner: «طريقة عرض الرئيسية للزائر مزعجة ومزحومة جدًّا. المهن اجعلها قائمة منسدلة ويختار
// المنطقة والمهنة، مقدم خدمة / طالب خدمة، ولا داعي لتصنيفات المهن»): two tabs at the top (service
// providers / service requests), two drop-down lists (region, profession), and the chosen list only.
const TAB_KEY = 'ayk_guest_tab';
export default function GuestHome() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [regions, setRegions] = useState([]);
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(TAB_KEY) === 'requests' ? 'requests' : 'providers'; } catch (_) { return 'providers'; } });
  const choose = next => { setTab(next); try { localStorage.setItem(TAB_KEY, next); } catch (_) { /* private mode */ } };
  const [requests, setRequests] = useState(null);
  const [providers, setProviders] = useState(null);
  // AYK-441: a choice with nothing yet shows the rest, saying so.
  const [requestsWider, setRequestsWider] = useState(false);
  const [providersWider, setProvidersWider] = useState(false);
  const [allProviders, setAllProviders] = useState(false);

  useEffect(() => {
    listCategories().then(rows => setCategories(rows || [])).catch(() => {});
    listRegions().then(rows => setRegions(rows || [])).catch(() => {});
  }, []);

  useEffect(() => {
    let current = true;
    setRequests(null);
    const params = { limit: 10, status: 'open' };
    if (category) params.category_id = category;
    if (region) params.region_id = region;
    listNearbyRequests(params)
      .then(async res => {
        let rows = res.data || []; let wider = false;
        if (!rows.length && (category || region)) {
          const all = await listNearbyRequests({ limit: 10, status: 'open' }).catch(() => null);
          rows = all?.data || []; wider = rows.length > 0;
        }
        if (current) { setRequests(rows); setRequestsWider(wider); }
      })
      .catch(() => { if (current) setRequests([]); });
    return () => { current = false; };
  }, [category, region]);

  useEffect(() => {
    let current = true;
    setProviders(null);
    listMatchingProviders({ scope: 'all', categoryId: category || undefined, regionId: region || undefined })
      .then(async res => {
        let rows = res?.providers || []; let wider = false;
        if (!rows.length && (category || region)) {
          rows = (await listMatchingProviders({ scope: 'all' }).catch(() => null))?.providers || []; wider = rows.length > 0;
        }
        if (current) { setProviders(rows); setProvidersWider(wider); }
      })
      .catch(() => { if (current) setProviders([]); });
    return () => { current = false; };
  }, [category, region]);

  const shownProviders = (providers || []).slice(0, allProviders ? 100 : 8);

  return (
    <div className="max-w-5xl mx-auto px-3 md:px-6 py-3 space-y-4" data-testid="guest-home">
      <div className="flex items-center justify-between gap-2 rounded-card border border-border bg-surface px-3 py-2">
        <span className="text-[12.5px] text-fg-muted">💬 {t('home.guest_chat_note')}</span>
        <Link to="/register" className="btn btn-primary btn-sm shrink-0 no-underline">{t('home.guest_register')}</Link>
      </div>

      <div className="sticky top-[var(--header-h,56px)] z-20 bg-bg/90 backdrop-blur py-1 -mx-1 px-1 space-y-1.5" data-testid="guest-filters">
        <div role="tablist" className="flex gap-2">
          {[['providers', '🛠️', 'home.tab_providers'], ['requests', '🙋', 'home.tab_requests']].map(([value, icon, key]) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => choose(value)} data-testid={`guest-tab-${value}`}
              className={`flex-1 min-w-0 rounded-card px-3 py-1.5 text-center border-2 transition cursor-pointer whitespace-nowrap text-[14.5px] font-extrabold text-fg ${tab === value
                ? (value === 'requests' ? 'tone-request border-primary shadow-soft' : 'tone-provider border-primary shadow-soft') : 'bg-surface border-border opacity-80'}`}>
              {icon} {t(key)}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className="select !h-10 !min-h-0 !py-1 text-[13.5px]" aria-label={t('home.guest_region')} value={region} onChange={e => setRegion(e.target.value)} data-testid="guest-region">
            <option value="">📍 {t('home.guest_all_regions')}</option>
            {regions.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
          </select>
          <select className="select !h-10 !min-h-0 !py-1 text-[13.5px]" aria-label={t('for_you.profession')} value={category} onChange={e => setCategory(e.target.value)} data-testid="guest-category">
            <option value="">🛠️ {t('requester.all_professions')}</option>
            {categories.map(cat => <option key={cat.id} value={cat.id}>{optionLabel(cat.icon, localizedName(cat, lang), lang)}</option>)}
          </select>
        </div>
      </div>

      {tab === 'requests' && <section data-testid="guest-requests">
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
      </section>}

      {tab === 'providers' && <section data-testid="guest-providers">
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
      </section>}
    </div>
  );
}
