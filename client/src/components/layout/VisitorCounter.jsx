import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

// The site's visitor counter (AYK-244). Every page reports this visitor once on opening and every
// 2 minutes while it is visible (for "online now"); each visitor is counted once a day on the
// server. The counter shows only when the owner made it public, or to admin accounts.
const PING_MS = 2 * 60 * 1000;
const ENTRY_KEY = 'ayk_visit_entry';

export default function VisitorCounter({ className = '' }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    // AYK-350: each entry to the site is a visit: the first report of this opening says so (kept for
    // this tab or app session, so moving between pages or reloading does not count again).
    const ping = () => {
      if (document.visibilityState === 'hidden') return;
      let entry = false;
      try { if (!sessionStorage.getItem(ENTRY_KEY)) { sessionStorage.setItem(ENTRY_KEY, '1'); entry = true; } } catch (_) { entry = !window.__aykEntryCounted; window.__aykEntryCounted = true; }
      api.post('/visits', { entry }).then((res) => { if (active) setData(res.data?.data || null); }).catch(() => {});
    };
    ping();
    const timer = setInterval(ping, PING_MS);
    document.addEventListener('visibilitychange', ping);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', ping); };
  }, []);

  if (!data?.visible) return null;
  const n = (v) => Number(v || 0).toLocaleString(i18n.resolvedLanguage);
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] ${className}`} data-testid="visitor-counter">
      <span>👥 {t('footer.visitors_today')}: <b>{n(data.today)}</b></span>
      <span>📈 {t('footer.visitors_total')}: <b>{n(data.total)}</b></span>
      <span><span className="inline-block w-2 h-2 rounded-full bg-emerald-400 align-middle" /> {t('footer.visitors_online')}: <b>{n(data.online)}</b></span>
    </div>
  );
}
