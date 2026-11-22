import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests, listMyOffers, contactRequest } from '../../services/requestService';
import ContactButtons from '../../components/providers/ContactButtons';
import useContactIntro from '../../hooks/useContactIntro';
import { showProblem } from '../../components/common/AppDialog';
import { useAuth } from '../../hooks/useAuth';
import RequestCard from '../../components/requests/RequestCard';
import { LoadingState, EmptyState } from '../../components/common/Spinner';
import { formatCurrency } from '../../utils/formatters';
import { OFFER_STATUS } from '../../utils/constants';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import AdSlot from '../../components/ads/AdSlot';
import ProblemNotice from '../../components/common/ProblemNotice';
import ShareProviderLink from '../../components/providers/ShareProviderLink';
import { ProviderSection } from '../ProfilePage';
import usePublicSettings from '../../hooks/usePublicSettings';
import RecentActivity from '../../components/home/RecentActivity';
import BoardEmpty from '../../components/home/BoardEmpty';
import RequestAlertPrompt from '../../components/provider/RequestAlertPrompt';
import BoardFilters from '../../components/home/BoardFilters';

export default function ProviderDashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const intro = useContactIntro();
  // AYK-435: the requests I contacted have the contact icons too (the chat about that request).
  const chatAbout = async offer => {
    try { const { conversation_id } = await contactRequest(offer.request_id); navigate(`/chat/${conversation_id}`); }
    catch (err) { if (!err?.cancelled) { navigate(`/requests/${offer.request_id}`); showProblem(err); } }
  };
  const { user, provider, refresh } = useAuth();
  // AYK-440 (the owner): every open request in every profession and area, ranked: my profession in
  // my area first, then my area, then my profession. «مهنتي» / «منطقتي» filter only when chosen; the
  // administration's «تقييد العرض» fixes both on. (Replaces AYK-400's «فك القيود».)
  const { settings } = usePublicSettings();
  const restricted = settings.marketplace_restrict_views === true || settings.marketplace_restrict_views === 'true';
  const [filters, setFilters] = useState({ prof: false, area: false });
  const board = restricted ? { prof: true, area: true } : filters;
  const unrestricted = !board.prof && !board.area;
  // AYK-401: the provider's own details edited here, in the dashboard.
  const [infoMsg, setInfoMsg] = useState('');
  const [infoErr, setInfoErr] = useState('');
  const [nearby, setNearby] = useState([]);
  const [boardMeta, setBoardMeta] = useState({});
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const shown = useRef(false);
  // New requests appear on their own (AYK-078).
  const [tick, quiet] = useLiveRefresh(['request:new_nearby', 'notification:new']);

  useEffect(() => {
    let current = true;
    // AYK-328: the page showed, then the loading sign came back for a moment and the page showed
    // again. Once it has been shown, a refresh keeps it on screen and only swaps the data.
    if (!quiet && !shown.current) setLoading(true);
    setError(false);
    // Requests in the provider's own professions and districts only (AYK-040).
    const params = { limit: 50, board: '1', ...(board.prof ? { f_prof: '1' } : {}), ...(board.area ? { f_area: '1' } : {}) };
    Promise.all([
      listNearbyRequests(params),
      listMyOffers({ limit: 5 }).then(r => r.data || []),
    ])
      .then(([n, o]) => { if (current) { setNearby(n.data || []); setBoardMeta(n.meta?.board || {}); setOffers(o); } })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) { shown.current = true; setLoading(false); } });
    return () => { current = false; };
  }, [tick, board.prof, board.area]);

  if (loading) return <LoadingState />;

  return (
    // AYK-422 (the owner: «في لوحة مقدم الخدمة اجعل الخط غامق ليكون أكثر وضوحًا»): bolder, darker text.
    <div className="provider-strong" data-testid="provider-dashboard">
      {/* A service provider's home is this page, so the top-of-home ads show here too (AYK-157). */}
      <AdSlot placement="home_top" className="mb-4" />
      <AdSlot placement="home_hero" className="mb-4" />
      {error && <ProblemNotice error={t('errors.generic')} />}
      {/* Paused: say so first, since requesters cannot see them; the settings live in "ملفي". */}
      {provider?.availability_status === 'paused' && (
        <div className="card mb-4 flex items-center justify-between gap-2 flex-wrap" role="status" data-testid="paused-notice">
          <span>⏸ {t('work.paused_notice')}</span>
          <Link to="/profile#work" className="btn btn-primary btn-sm">▶ {t('work.resume_in_profile')}</Link>
        </div>
      )}

      <div className="card mb-4" data-testid="work-requests">
        <div className="flex justify-between items-center gap-2 flex-wrap mb-3">
          <h3 style={{ margin: 0 }}>📨 {t(unrestricted ? 'work.all_open_title' : 'work.requests_title')}</h3>
          <Link to="/opportunities" className="text-[13px] font-semibold">{t('work.see_all')}</Link>
        </div>
        <BoardFilters value={filters} onChange={setFilters} asProvider restricted={restricted}
          hint={boardMeta.has_profession === false ? t('home.filter_need_services') : ''} />
        <div className="mb-3" />
        <RequestAlertPrompt noneForMe={!nearby.some(r => r.board_profession && r.board_area)} />
        {boardMeta.fallback && <p className="text-[12.5px] rounded-card bg-amber-50 text-amber-900 px-3 py-2 mb-2" role="status" data-testid="board-fallback">💡 {t('home.board_fallback')}</p>}
        {nearby.length === 0
          ? (restricted ? <EmptyState title={t('home.board_none_filtered')} /> : <BoardEmpty who="provider" />)
          : <div className="grid grid-2">{nearby.map(r => <RequestCard key={r.id} request={r} />)}</div>}
        <RecentActivity asProvider className="mt-3" />
      </div>


      {/* AYK-401 (the owner: «في لوحة مقدم الخدمة ما فيه إمكانية تعديل معلوماته والوصف وإضافة الجوال والواتس»). */}
      <details className="card mb-4 group" data-testid="dashboard-my-info" open={Boolean(infoMsg || infoErr) || undefined}>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2">
          <span className="min-w-0">
            <b className="block">✏️ {t('work.my_info_title')}</b>
            <span className="text-[12.5px] text-fg-muted">{t('work.my_info_hint')}</span>
          </span>
          <span className="btn btn-outline btn-sm shrink-0">{t('work.my_info_edit')}</span>
        </summary>
        <div className="mt-3">
          {infoMsg && <p className="mb-2 p-2 rounded-card bg-success-soft text-success text-[13px]" role="status">✅ {infoMsg}</p>}
          {infoErr && <ProblemNotice error={infoErr} />}
          <ProviderSection onSaved={setInfoMsg} onError={setInfoErr} t={t} refresh={refresh} />
        </div>
      </details>

      {/* AYK-398: the former requesters, to look up. */}
      <Link to="/provider/clients" className="card mb-4 flex items-center justify-between gap-2 no-underline text-fg" data-testid="previous-clients-link">
        <span className="min-w-0">
          <b className="block">⭐ {t('work.previous_clients_title')}</b>
          <span className="text-[12.5px] text-fg-muted">{t('work.previous_clients_hint')}</span>
        </span>
        <span className="btn btn-outline btn-sm shrink-0">{t('work.see_all')}</span>
      </Link>

      <div className="card">
        <div className="flex items-center justify-between gap-2">
          <h3>{t('work.my_contacts_title')}</h3>
          <Link to="/provider/tasks" className="text-[13px] font-semibold underline">{t('work.see_all')}</Link>
        </div>
        {offers.length === 0
          ? <EmptyState title={t('common.none')} />
          : (
            <div className="flex flex-col gap-2">
              {offers.map(o => {
                const oStatus = OFFER_STATUS[o.status] || {};
                return (
                  <div key={o.id} className="offer-list-item tone-request">
                    <div style={{ flex: 1 }} className="min-w-0">
                      <Link to={`/requests/${o.request_id}`} className="font-bold text-fg no-underline">{o.request_title}</Link>
                      <div className="text-xs text-muted">{o.status === 'accepted' ? <b className="text-primary">📌 {t('work.assigned_to_you')}</b> : (oStatus.i18nKey ? t(oStatus.i18nKey) : o.status)}</div>
                    </div>
                    {Number(o.price) > 0 && <div style={{ fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency(o.price)}</div>}
                    <ContactButtons size="xs" testId="my-contact" onChat={() => chatAbout(o)}
                      intro={intro({ request: o.request_title })} link={`/requests/${o.request_id}`} />
                  </div>
                );
              })}
            </div>
          )}
      </div>

      {/* The provider's own public page link, to share or for others to keep in «دليلي» (AYK-312). */}
      {user?.id && <div className="mt-4" id="share-link"><ShareProviderLink providerId={user.id} name={provider?.business_name || user.full_name} mine /></div>}
      <AdSlot placement="home_middle" className="mt-4" />
      <AdSlot placement="home_bottom" className="mt-4" />
      <style>{`
        .offer-list-item {
          display: flex; align-items: center; gap: 12px; padding: 12px 14px;
          border: 1px solid var(--border); border-radius: var(--radius); color: inherit; text-decoration: none;
        }
        .offer-list-item:hover { background: var(--bg-soft); text-decoration: none; }
      `}</style>
    </div>
  );
}
