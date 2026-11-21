import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listNearbyRequests } from '../../services/requestService';
import RequestCard from '../requests/RequestCard';
import useLiveRefresh from '../../hooks/useLiveRefresh';

// AYK-333 (the owner): a service provider sees, on their first page, the requesters' requests in
// their own profession and coverage area. The provider's dashboard has had this list; an account
// that is both requester and provider opens the requester's home, which did not. Same data.
export default function WorkRequests({ className = '' }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const shown = useRef(false);
  const [tick] = useLiveRefresh(['request:new_nearby', 'notification:new']);
  useEffect(() => {
    let alive = true;
    listNearbyRequests({ limit: 20, matching: '1' })
      .then(result => { if (alive) { shown.current = true; setRows(result.data || []); } })
      .catch(() => { if (alive && !shown.current) setRows([]); });
    return () => { alive = false; };
  }, [tick]);
  if (rows === null) return null;
  return (
    <div className={`card tone-provider p-4 ${className}`} data-testid="work-requests">
      <div className="flex justify-between items-center gap-2 flex-wrap mb-3">
        <h2 className="text-lg font-extrabold text-fg m-0">📨 {t('work.requests_title')}</h2>
        <Link to="/opportunities" className="text-[13px] font-semibold">{t('work.see_all')}</Link>
      </div>
      {rows.length === 0
        ? <p className="text-[13.5px] text-fg-muted m-0">{t('work.no_requests')}</p>
        : <div className="grid grid-2">{rows.map(request => <RequestCard key={request.id} request={request} />)}</div>}
    </div>
  );
}
