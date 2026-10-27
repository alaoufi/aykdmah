import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getDashboard } from '../../services/adminService';
import { apiError } from '../../services/api';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { REQUEST_STATUS } from '../../utils/constants';
import Avatar from '../../components/common/Avatar';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import { useAuth } from '../../hooks/useAuth';

const STATUS_BADGE = {
  'badge-primary': 'bg-brand-50 text-brand-700',
  'badge-warning': 'bg-amber-50 text-amber-700',
  'badge-success': 'bg-emerald-50 text-emerald-700',
  'badge-danger': 'bg-rose-50 text-rose-700',
  'badge': 'bg-slate-100 text-slate-600',
};

const ROLE_BADGE = {
  admin: 'bg-rose-50 text-rose-600',
  provider: 'bg-emerald-50 text-emerald-600',
  client: 'bg-brand-50 text-brand-700',
};

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-[100px] rounded-card bg-white border border-slate-100 animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[300px] rounded-card bg-white border border-slate-100 animate-pulse" />
        <div className="h-[300px] rounded-card bg-white border border-slate-100 animate-pulse" />
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch((err) => setError(apiError(err) || t('errors.generic')));
  }, [t]);

  const TILES = [
    { key: 'users',                 labelKey: 'admin.stats_users_total',          icon: '👥', color: '#3b82f6', bg: '#dbeafe' },
    { key: 'providers',             labelKey: 'admin.stats_providers',            icon: '🛠️', color: '#10b981', bg: '#d1fae5' },
    { key: 'clients',               labelKey: 'admin.stats_clients',              icon: '🙋', color: '#6366f1', bg: '#e0e7ff' },
    { key: 'requests',              labelKey: 'admin.stats_requests_total',       icon: '📋', color: '#f59e0b', bg: '#fef3c7' },
    { key: 'active_requests',       labelKey: 'admin.stats_requests_active',      icon: '⚡', color: '#ef4444', bg: '#fee2e2' },
    { key: 'completed_requests',    labelKey: 'admin.stats_requests_completed',   icon: '✅', color: '#22c55e', bg: '#dcfce7' },
    { key: 'urgent_requests',       labelKey: 'admin.stats_requests_urgent',      icon: '🔥', color: '#dc2626', bg: '#fee2e2' },
    { key: 'revenue',               labelKey: 'admin.stats_revenue',              icon: '💰', color: '#0ea5e9', bg: '#e0f2fe', isMoney: true },
    { key: 'active_subscriptions',  labelKey: 'admin.stats_subscriptions',        icon: '💎', color: '#8b5cf6', bg: '#ede9fe' },
    { key: 'pending_verifications', labelKey: 'admin.stats_pending_verifications', icon: '🛡️', color: '#06b6d4', bg: '#cffafe' },
    { key: 'conversations',         labelKey: 'admin.stats_conversations',        icon: '💬', color: '#0891b2', bg: '#cffafe', link: '/admin/conversations' },
    { key: 'active_conversations',  labelKey: 'admin.stats_active_conversations', icon: '🟢', color: '#16a34a', bg: '#dcfce7', link: '/admin/conversations' },
    { key: 'messages',              labelKey: 'admin.stats_messages',             icon: '✉️', color: '#7c3aed', bg: '#ede9fe' },
    { key: 'voice_messages',        labelKey: 'admin.stats_voice_messages',       icon: '🎙️', color: '#db2777', bg: '#fce7f3' },
    { key: 'live_locations',        labelKey: 'admin.stats_live_locations',       icon: '📍', color: '#ea580c', bg: '#ffedd5', link: '/admin/conversations' },
    { key: 'open_disputes',         labelKey: 'admin.stats_open_disputes',        icon: '⚖️', color: '#b91c1c', bg: '#fee2e2', link: '/admin/disputes' },
    { key: 'disputes',              labelKey: 'admin.stats_disputes_total',       icon: '📁', color: '#475569', bg: '#e2e8f0', link: '/admin/disputes' },
    { key: 'test_users',            labelKey: 'admin.stats_test_users',           icon: '🧪', color: '#9333ea', bg: '#f3e8ff' },
  ];

  const QUICK_ACTIONS = [
    { to: '/admin/users', icon: '👥', labelKey: 'admin.users', perm: 'users.manage' },
    { to: '/admin/conversations', icon: '💬', labelKey: 'admin.conversations_monitor', perm: 'conversations.read' },
    { to: '/admin/locations', icon: '🗺️', labelKey: 'admin.locations', perm: 'locations.manage' },
    { to: '/admin/verifications', icon: '🛡️', labelKey: 'admin.verifications', perm: 'verifications.review' },
    { to: '/admin/ads', icon: '📣', labelKey: 'admin.ads', perm: 'ads.manage' },
    { to: '/admin/settings', icon: '⚙️', labelKey: 'admin.settings', perm: 'settings.manage' },
  ].filter((action) => hasPermission(action.perm));

  if (error) {
    return (
      <div className="rounded-card bg-rose-50 border border-rose-200 p-6 text-rose-700">{error}</div>
    );
  }
  if (!data) return <Skeleton />;

  const { stats, recent_users, recent_requests, requests_by_status } = data;
  const totalByStatus = (requests_by_status || []).reduce((a, x) => a + Number(x.total), 0) || 1;

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t('admin.dashboard')}>
        {hasPermission('users.manage') && <Link
          to="/admin/users"
          className="px-4 py-2 rounded-pill bg-white border border-slate-200 hover:border-brand-300 hover:text-brand-700 text-slate-700 text-sm font-semibold no-underline transition"
        >
          {t('admin.users')}
        </Link>}
        {hasPermission('settings.manage') && <Link
          to="/admin/settings"
          className="px-4 py-2 rounded-pill text-white text-sm font-semibold no-underline transition shadow-soft hover:shadow-lift"
          style={{ background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}
        >
          {t('admin.settings')}
        </Link>}
      </AdminPageHeader>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {TILES.map((tile) => {
          const raw = stats?.[tile.key] ?? 0;
          const value = tile.isMoney ? formatCurrency(raw) : Number(raw).toLocaleString();
          const linkPerm = tile.link === '/admin/conversations' ? 'conversations.read' : 'disputes.manage';
          const link = tile.link && hasPermission(linkPerm) ? tile.link : null;
          const Wrap = link ? Link : 'div';
          const wrapProps = link ? { to: link } : {};
          return (
            <Wrap
              key={tile.key}
              {...wrapProps}
              className={`bg-white rounded-card border border-slate-100 p-4 md:p-5 flex items-center gap-3 shadow-soft transition no-underline ${tile.link ? 'hover:shadow-lift hover:border-slate-200 cursor-pointer' : 'hover:shadow-card'}`}
              style={{ borderInlineStartWidth: 4, borderInlineStartColor: tile.color }}
            >
              <span
                className="w-12 h-12 rounded-card grid place-items-center text-xl shrink-0"
                style={{ background: tile.bg, color: tile.color }}
              >
                {tile.icon}
              </span>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-500 font-medium truncate">{t(tile.labelKey)}</div>
                <div className="text-[20px] md:text-[22px] font-extrabold text-ink truncate">{value}</div>
              </div>
            </Wrap>
          );
        })}
      </div>

      {/* Quick actions */}
      {QUICK_ACTIONS.length > 0 && <div className="bg-white rounded-card border border-slate-100 p-5 md:p-6 shadow-soft">
        <h3 className="text-ink text-[15px] font-extrabold mb-4">{t('admin.quick_actions')}</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="flex flex-col items-center gap-2 p-3 rounded-card bg-slate-50 hover:bg-slate-100 transition no-underline"
            >
              <span className="text-2xl">{a.icon}</span>
              <span className="text-[12px] font-semibold text-slate-700 text-center">{t(a.labelKey)}</span>
            </Link>
          ))}
        </div>
      </div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status distribution */}
        <div className="bg-white rounded-card border border-slate-100 p-5 md:p-6 shadow-soft">
          <h3 className="text-ink text-[15px] font-extrabold mb-4">{t('admin.requests')}</h3>
          {(requests_by_status || []).length === 0 ? (
            <div className="text-center py-8 text-slate-400">{t('common.none')}</div>
          ) : (
            <div className="space-y-3">
              {requests_by_status.map((s) => {
                const pct = (Number(s.total) / totalByStatus) * 100;
                const info = REQUEST_STATUS[s.status] || {};
                const infoLabel = info.i18nKey ? t(info.i18nKey) : s.status;
                return (
                  <div key={s.status}>
                    <div className="flex items-center justify-between mb-1.5 text-[13px]">
                      <span className="font-semibold text-ink">{infoLabel}</span>
                      <span className="text-slate-500">
                        {s.total} <span className="text-slate-400">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #0ea5e9, #6366f1)' }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent users */}
        {hasPermission('users.manage') && <div className="bg-white rounded-card border border-slate-100 p-5 md:p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-ink text-[15px] font-extrabold">{t('admin.users')}</h3>
            <Link to="/admin/users" className="text-brand-600 text-[12px] font-semibold no-underline hover:text-brand-700">
              {t('common.view')}
            </Link>
          </div>
          <div className="space-y-2">
            {(recent_users || []).length === 0 ? (
              <div className="text-center py-8 text-slate-400">{t('common.none')}</div>
            ) : (
              recent_users.slice(0, 6).map((u) => (
                <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-card hover:bg-slate-50 transition">
                  <Avatar src={u.avatar} name={u.full_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold text-ink truncate">{u.full_name}</div>
                    <div className="text-[11.5px] text-slate-500 truncate">{u.email}</div>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-pill ${ROLE_BADGE[u.role] || 'bg-slate-100 text-slate-600'}`}>
                    {u.role === 'admin' ? t('nav.admin') : u.role === 'provider' ? t('auth.role_provider') : t('auth.role_client')}
                  </span>
                  <span className="text-[10.5px] text-slate-400 hidden sm:inline">{formatRelativeTime(u.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>}
      </div>

      {/* Recent requests */}
      {hasPermission('requests.manage') && <div className="bg-white rounded-card border border-slate-100 shadow-soft overflow-hidden">
        <div className="flex items-center justify-between p-5 md:p-6 border-b border-slate-100">
          <h3 className="text-ink text-[15px] font-extrabold">{t('admin.requests')}</h3>
          <Link to="/admin/requests" className="text-brand-600 text-[12px] font-semibold no-underline hover:text-brand-700">
            {t('common.view')}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-right text-[11.5px] font-bold text-slate-500 uppercase border-b border-slate-100 bg-slate-50/50">
                <th className="px-5 md:px-6 py-2.5">{t('request.title')}</th>
                <th className="py-2.5">{t('auth.role_client')}</th>
                <th className="py-2.5">{t('admin.status')}</th>
                <th className="py-2.5 px-5 md:px-6">{t('admin.created_at')}</th>
              </tr>
            </thead>
            <tbody>
              {(recent_requests || []).length === 0 ? (
                <tr><td colSpan="4" className="text-center py-12 text-slate-400">{t('common.none')}</td></tr>
              ) : (
                recent_requests.slice(0, 8).map((r) => {
                  const info = REQUEST_STATUS[r.status] || { color: 'badge' };
                  const infoLabel = info.i18nKey ? t(info.i18nKey) : r.status;
                  return (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition">
                      <td className="px-5 md:px-6 py-3">
                        <div className="flex items-center gap-2">
                          {r.is_urgent && <span className="text-rose-500">⚡</span>}
                          <Link
                            to={`/requests/${r.id}`}
                            className="text-[13.5px] font-semibold text-ink hover:text-brand-700 no-underline truncate max-w-[260px] inline-block"
                          >
                            {r.title}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 text-[12.5px] text-slate-600">{r.client_name || '—'}</td>
                      <td className="py-3">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-pill text-[11px] font-bold ${STATUS_BADGE[info.color] || STATUS_BADGE['badge']}`}>
                          {infoLabel}
                        </span>
                      </td>
                      <td className="py-3 px-5 md:px-6 text-[11.5px] text-slate-400">{formatRelativeTime(r.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>}
    </div>
  );
}
