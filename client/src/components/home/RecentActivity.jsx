import { useTranslation } from 'react-i18next';
import { localizedJoinedName } from '../../utils/localizeJoined';

// AYK-441 (the owner: «إذا دخل العضو ولم يجد أحدًا خرج ولم يعد، يعتبره ميتًا»): when the open requests
// are few, the requests served lately show under them, so the place shows it is alive. Read only:
// the title, the profession and the city, as any open request already shows them; nothing to open.
export default function RecentActivity({ rows = [], className = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  if (!rows.length) return null;
  return (
    <div className={`rounded-card border border-border bg-surface p-3 ${className}`} data-testid="recent-activity">
      <h3 className="text-[14.5px] font-extrabold text-fg m-0">✨ {t('home.recent_title')}</h3>
      <p className="text-[12px] text-fg-muted mt-0.5 mb-2">{t('home.recent_hint')}</p>
      <ul className="list-none p-0 m-0 divide-y divide-border">
        {rows.map(row => {
          const done = row.status === 'done';
          return (
            <li key={row.id} className="py-1.5 flex items-center gap-2 min-w-0">
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white"
                style={{ background: done ? '#059669' : '#0369a1' }}>
                {done ? '✓ ' : ''}{t(done ? 'home.recent_done' : 'home.recent_working')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-fg truncate">{row.translation?.title || row.title}</span>
                <span className="block text-[11.5px] text-fg-muted truncate">
                  {[localizedJoinedName(row, 'category', lang), localizedJoinedName(row, 'city', lang)].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
