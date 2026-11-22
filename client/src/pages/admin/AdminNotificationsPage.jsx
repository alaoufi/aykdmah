import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listNotifications, markNotificationRead } from '../../services/chatService';
import api from '../../services/api';
import { LoadingState } from '../../components/common/Spinner';
import { formatRelativeTime } from '../../utils/formatters';

// AYK-458 (the owner: «في الإدارة بالكامل إدارة، لا علاقة لها بالموقع، فصل كامل»): the administration's
// own notices only (a user's message to support, …), each opening its administration page. The site's
// notices of the same account stay on the site. Arabic only, as the whole administration (AYK-295).
export default function AdminNotificationsPage() {
  const [rows, setRows] = useState(null);
  const load = () => listNotifications({ scope: 'admin', limit: 50 }).then(res => setRows(res.data || [])).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  if (rows === null) return <LoadingState />;
  return (
    <div className="space-y-3" data-testid="admin-notifications">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-fg m-0">🔔 إشعارات الإدارة</h1>
        {rows.some(row => !Number(row.is_read)) && (
          <button type="button" className="btn btn-outline btn-sm" onClick={() => api.put('/notifications/read-all', null, { params: { scope: 'admin' } }).then(load)}>
            تعليم الكل كمقروء
          </button>
        )}
      </div>
      {rows.length === 0 ? <div className="card text-[13px] text-fg-muted">لا إشعارات للإدارة.</div> : (
        <div className="card p-0 divide-y divide-border">
          {rows.map(row => (
            <Link key={row.id} to={row.link || '/admin'} onClick={() => markNotificationRead(row.id).catch(() => {})}
              className={`block px-3 py-2.5 no-underline text-fg hover:bg-surface-alt ${Number(row.is_read) ? '' : 'bg-primary-soft/40'}`} data-testid="admin-notification">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[14px]">{row.title}</b>
                <span className="text-[11.5px] text-fg-muted shrink-0">{formatRelativeTime(row.created_at)}</span>
              </div>
              {row.body && <div className="text-[12.5px] text-fg-muted mt-0.5">{row.body}</div>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
