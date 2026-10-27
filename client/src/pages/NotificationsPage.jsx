import { internalAuthReturn } from '../utils/authReturn';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '../hooks/useNotifications';
import { Link } from 'react-router-dom';
import { formatRelativeTime } from '../utils/formatters';
import { EmptyState } from '../components/common/Spinner';
import Button from '../components/common/Button';
import { localizedNotification } from '../data/notificationLabels';

export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const { items, unread, markRead, markAllRead } = useNotifications();

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <div className="flex items-center justify-between mb-4">
        <h2>{t('notification.title')}</h2>
        {unread > 0 && <Button variant="outline" size="sm" onClick={() => markAllRead().catch(() => {})}>{t('notification.mark_all_read')}</Button>}
      </div>

      {items.length === 0 ? (
        <EmptyState title={t('notification.no_notifications')} icon="🔔" />
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(n => (
            <div key={n.id} className={`notif-item ${!n.is_read ? 'unread' : ''}`}>
              <div style={{ flex: 1 }}>
                <strong>{localizedNotification(n, i18n.language).title}</strong>
                {n.body && <p className="text-sm text-secondary" style={{ margin: 0 }}>{localizedNotification(n, i18n.language).body}</p>}
                <div className="text-xs text-muted">{formatRelativeTime(n.created_at)}</div>
              </div>
              {internalAuthReturn(n.link) && (
                <Link
                  to={internalAuthReturn(n.link)}
                  className="btn btn-sm btn-ghost"
                  onClick={() => { if (!n.is_read) void markRead(n.id).catch(() => {}); }}
                >
                  {t('common.view')}
                </Link>
              )}
              {!n.is_read && (
                <button className="btn btn-sm btn-ghost" onClick={() => markRead(n.id).catch(() => {})} aria-label={t('notification.marked_read')}>✓</button>
              )}
            </div>
          ))}
        </div>
      )}

      <style>{`
        .notif-item {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; background: var(--bg-card); border: 1px solid var(--border);
          border-radius: var(--radius); transition: var(--transition);
        }
        .notif-item.unread { background: rgba(14,165,233,.06); border-color: rgba(14,165,233,.2); }
      `}</style>
    </div>
  );
}
