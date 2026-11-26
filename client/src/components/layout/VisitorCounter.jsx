import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';

// The site's visitor counter (AYK-244). Every page reports this visitor once on opening and every
// 2 minutes while it is visible (for "online now"); each visitor is counted once a day on the
// server. The counter shows only when the owner made it public, or to admin accounts.
const PING_MS = 2 * 60 * 1000;
const RETURN_MS = 5 * 60 * 1000; // away this long (in the background), coming back counts as a new entry

export default function VisitorCounter({ className = '' }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState(null);

  useEffect(() => {
    let active = true;
    // AYK-350: each entry to the site is a visit. AYK-376 (the owner: «لو عملت تحديث المفروض يعتبرها
    // زيارة»): a reload is an entry too; only moving between pages inside one loading is not.
    // AYK-507 (the owner: «يتحدث مع كل تحديث أو دخول»): coming back to a page or app left in the background
    // for a few minutes is an entry too, like opening the site again.
    let hiddenAt = 0;
    const ping = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = hiddenAt || Date.now(); return; }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      const entry = !window.__aykEntryCounted || away >= RETURN_MS;
      window.__aykEntryCounted = true;
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
