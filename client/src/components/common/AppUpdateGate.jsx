import { useTranslation } from 'react-i18next';
import { thisLaunch, storeUpdateNeeded } from '../../utils/nativeApp';
import usePublicSettings from '../../hooks/usePublicSettings';

// A required app update, from the stores only (owner's decision, AYK-292): an app older than the
// minimum set in the admin settings is sent to its store page. There is no "download the file"
// screen any more: on Huawei phones Google Play runs inside GBox, so an app installed from the
// store reported itself as a downloaded file and was sent to the browser for one, again and again.
export default function AppUpdateGate() {
  const { t } = useTranslation();
  const { settings } = usePublicSettings();
  const store = storeUpdateNeeded(thisLaunch(), settings, typeof navigator === 'undefined' ? '' : navigator.userAgent);

  const needed = store;
  if (!needed) return null;
  return (
    <div className="fixed inset-0 z-[5000] grid place-items-center bg-bg px-6" role="dialog" aria-modal="true" aria-labelledby="app-update-title" data-testid="app-update-gate">
      <div className="w-full max-w-sm text-center">
        <img src="/icons/app-icon-192.png" alt="" className="mx-auto mb-5 w-20 h-20 rounded-[22px] shadow-card" />
        <h1 id="app-update-title" className="text-[21px] font-extrabold text-fg mb-2">{t('app_update.title')}</h1>
        <p className="text-[14.5px] text-fg-muted leading-relaxed mb-6">
          {t('app_update.store_body')} <span dir="ltr" className="font-bold">{needed.version}</span>
        </p>
        <a href={needed.url} className="btn btn-primary w-full justify-center" data-testid="app-update-link">⬇️ {t('app_update.store_button')}</a>
        <p className="text-[12.5px] text-fg-muted mt-4 mb-0 leading-relaxed">{t('app_update.store_hint')}</p>
      </div>
    </div>
  );
}
