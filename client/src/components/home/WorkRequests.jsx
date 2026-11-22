import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests } from '../../services/requestService';
import RequestCard from '../requests/RequestCard';
import useLiveRefresh from '../../hooks/useLiveRefresh';
import RecentActivity from './RecentActivity';
import BoardEmpty from './BoardEmpty';
import RequestAlertPrompt from '../provider/RequestAlertPrompt';

// AYK-333 (the owner): a service provider sees, on their first page, the requesters' requests in
// their own profession and coverage area. The provider's dashboard has had this list; an account
// that is both requester and provider opens the requester's home, which did not. Same data.
// AYK-397: `scope` widens the circle; `asProvider` false shows others' requests around a requester.
// AYK-440: `board` ({ prof, area }) — the home board: every open request ranked by the server (my
// profession and area first); the two buttons above filter only when chosen.
export default function WorkRequests({ className = '', scope = 'area', asProvider = true, board = null }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({});
  const shown = useRef(false);
  const [tick] = useLiveRefresh(['request:new_nearby', 'notification:new']);
  useEffect(() => {
    let alive = true;
    const params = board
      ? { limit: 30, board: '1', ...(board.prof ? { f_prof: '1' } : {}), ...(board.area ? { f_area: '1' } : {}), ...(asProvider ? {} : { as: 'requester' }) }
      : { limit: 20, ...(asProvider ? { matching: '1' } : {}), ...(scope !== 'area' || !asProvider ? { scope } : {}) };
    listNearbyRequests(params)
      .then(result => { if (alive) { shown.current = true; setRows(result.data || []); setMeta(result.meta?.board || {}); } })
      .catch(() => { if (alive && !shown.current) setRows([]); });
    return () => { alive = false; };
  }, [tick, scope, asProvider, board?.prof, board?.area]);
  if (rows === null) return null;
  return (
    <div className={`card tone-provider p-4 ${className}`} data-testid="work-requests">
      <div className="flex justify-between items-center gap-2 flex-wrap mb-3">
        <h2 className="text-lg font-extrabold text-fg m-0">📨 {t(board ? (board.prof || board.area ? (asProvider ? 'work.requests_title' : 'home.requests_around_title') : 'work.all_open_title') : scope === 'open' ? 'work.all_open_title' : asProvider ? 'work.requests_title' : 'home.requests_around_title')}</h2>
        {asProvider && <Link to="/opportunities" className="text-[13px] font-semibold">{t('work.see_all')}</Link>}
      </div>
      {/* AYK-441: nothing for the buttons chosen, so the rest is shown, and it says so. */}
      {board && asProvider && <RequestAlertPrompt noneForMe={!rows.some(r => r.board_profession && r.board_area)} />}
      {meta.fallback && <p className="text-[12.5px] rounded-card bg-amber-50 text-amber-900 px-3 py-2 mb-2" role="status" data-testid="board-fallback">💡 {t('home.board_fallback')}</p>}
      {rows.length === 0
        ? (board && !meta.restricted ? <BoardEmpty who={asProvider ? 'provider' : 'requester'} />
          : <p className="text-[13.5px] text-fg-muted m-0">{t(board ? (board.prof || board.area ? 'home.board_none_filtered' : 'home.no_requests_anywhere') : scope === 'all' || scope === 'open' ? 'home.no_requests_anywhere' : scope === 'area' && asProvider ? 'work.no_requests' : 'home.no_requests_widen')}</p>)
        : <div className="grid grid-2">{rows.map(request => <RequestCard key={request.id} request={request} />)}</div>}
      {board && <RecentActivity asProvider={asProvider} className="mt-3" />}
    </div>
  );
}
