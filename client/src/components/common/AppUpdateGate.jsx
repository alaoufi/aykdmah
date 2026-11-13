import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { atLeast, nativeAppSource, nativeAppVersion } from '../../utils/nativeApp';

// A required app update (AYK-148). An Android app installed from aykdmh.com/dl (?src=apk) stops
// at this screen while a newer app is published there (/dl/latest.json, written by
// android/publish-apk.sh): it works again only after the update. An app from Google Play is
// forced by Play itself (In-App Updates, in LauncherActivity); site updates never stop anything.
export default function AppUpdateGate() {
  const { t } = useTranslation();
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    const current = nativeAppVersion();
    if (!current || nativeAppSource() !== 'apk') return undefined;
    const check = () => {
      if (document.hidden) return;
      fetch('/dl/latest.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
        .then(info => {
          if (info?.version && info?.url && /^[0-9][0-9.]{0,15}$/.test(info.version)
            && String(info.url).startsWith('/dl/') && !atLeast(current, info.version)) setLatest(info);
        }).catch(() => {});
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);

  if (!latest) return null;
  return (
    <div className="fixed inset-0 z-[5000] grid place-items-center bg-bg px-6" role="dialog" aria-modal="true" aria-labelledby="app-update-title" data-testid="app-update-gate">
      <div className="w-full max-w-sm text-center">
        <img src="/icons/app-icon-192.png" alt="" className="mx-auto mb-5 w-20 h-20 rounded-[22px] shadow-card" />
        <h1 id="app-update-title" className="text-[21px] font-extrabold text-fg mb-2">{t('app_update.title')}</h1>
        <p className="text-[14.5px] text-fg-muted leading-relaxed mb-6">
          {t('app_update.body')} <span dir="ltr" className="font-bold">{latest.version}</span>
        </p>
        <a href={latest.url} className="btn btn-primary w-full justify-center">⬇️ {t('app_update.download')}</a>
        <p className="text-[12.5px] text-fg-muted mt-4 mb-0 leading-relaxed">{t('app_update.hint')}</p>
      </div>
    </div>
  );
}
