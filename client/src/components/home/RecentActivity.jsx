import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { localizedJoinedName } from '../../utils/localizeJoined';
import { formatRelativeTime } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import usePublicSettings from '../../hooks/usePublicSettings';
import BoardFilters from './BoardFilters';

// AYK-441 (the owner: «إذا دخل العضو ولم يجد أحدًا خرج ولم يعد، يعتبره ميتًا»): the requests agreed on
// lately show on every board, so the place shows it is alive.
// AYK-442 (the owner: «أضف تم مؤخرًا ويختار قبل كم يوم، وكل المهن أو تقييد مهنة / تقييد منطقة. تذكر:
// المهنة، المدينة، وقت الاتفاق»): the person picks how far back, and all professions or only his
// profession and/or his area. Each line: the profession, the city, when the agreement was made.
// Nothing about the people and nothing to open.
const DAYS = [1, 7, 30, 90];

// AYK-510 (the owner: «هذي مكررة، أبقِ الي فوق»): on the home board the three buttons above the requests already
// choose what is shown, so this block follows them (`board`) and no longer draws its own copy of them.
export default function RecentActivity({ asProvider = false, className = '', board = null }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { user } = useAuth();
  const { settings } = usePublicSettings();
  const restricted = Boolean(user) && (settings.marketplace_restrict_views === true || settings.marketplace_restrict_views === 'true');
  const [days, setDays] = useState(30);
  const [filters, setFilters] = useState({ prof: false, area: false });
  const on = restricted ? { prof: true, area: true } : (board || filters);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    let alive = true;
    const params = { days, limit: 20, ...(on.prof ? { f_prof: '1' } : {}), ...(on.area ? { f_area: '1' } : {}), ...(user && !asProvider ? { as: 'requester' } : {}) };
    api.get('/requests/recent', { params })
      .then(({ data }) => { if (alive) { setRows(data.data || []); setMeta(data.meta || null); } })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [days, on.prof, on.area, asProvider, Boolean(user), filters.rev, board?.rev]);
  const chip = (active, label, onClick, testId) => (
    <button type="button" aria-pressed={active} onClick={onClick} data-testid={testId}
      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold border transition ${active
        ? 'bg-primary text-white border-primary' : 'bg-surface text-fg border-border hover:bg-surface-alt'}`}>
      {active ? '✓ ' : ''}{label}
    </button>
  );
  return (
    <div className={`rounded-card border border-border bg-surface p-3 ${className}`} data-testid="recent-activity">
      <h3 className="text-[14.5px] font-extrabold text-fg m-0">✨ {t('home.recent_title')}</h3>
      <p className="text-[12px] text-fg-muted mt-0.5 mb-2">{t('home.recent_hint')}</p>
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5" role="group" aria-label={t('home.recent_period')} data-testid="recent-days">
        <span className="text-[11.5px] text-fg-muted shrink-0">🕒 {t('home.recent_period')}</span>
        {DAYS.map(value => chip(days === value, t(`home.recent_days_${value}`), () => setDays(value), `recent-days-${value}`))}
      </div>
      {user && !board && <div className="mb-2"><BoardFilters size="sm" testId="recent" value={filters} onChange={setFilters} asProvider={asProvider} restricted={restricted} meta={meta} /></div>}
      {rows === null ? <div className="h-10 rounded-card bg-surface-alt animate-pulse" />
        : !rows.length ? <p className="text-[12.5px] text-fg-muted m-0 py-1" data-testid="recent-none">{t('home.recent_none')}</p>
          : (
            <ul className="list-none p-0 m-0 divide-y divide-border">
              {rows.map(row => {
                const done = row.status === 'done';
                return (
                  <li key={row.id} className="py-1.5 flex items-center gap-2 min-w-0" data-testid="recent-row">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-bold text-fg truncate">{localizedJoinedName(row, 'category', lang)}</span>
                      <span className="block text-[11.5px] text-fg-muted truncate">
                        📍 {localizedJoinedName(row, 'city', lang)} · 🤝 {t('home.recent_agreed', { when: formatRelativeTime(row.agreed_at) })}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                      style={{ background: done ? '#059669' : '#0369a1' }}>
                      {done ? '✓ ' : ''}{t(done ? 'home.recent_done' : 'home.recent_working')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
    </div>
  );
}
