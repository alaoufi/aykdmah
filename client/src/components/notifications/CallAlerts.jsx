import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { enablePush, needsHomeScreen, pushState } from '../../services/pushService';
import Button from '../common/Button';

const DISMISS_KEY = 'ayk_call_alerts_dismissed';
const dismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (_) { return false; } };

// Turns on incoming-call notifications for this device (rings even when the site is closed).
// variant 'card': the profile section with the current state; 'banner': a one-time prompt.
export default function CallAlerts({ variant = 'card' }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(variant === 'banner' && dismissed());

  useEffect(() => { pushState().then(setState); }, [user?.id]);

  if (!user || state === null || hidden) return null;
  if (variant === 'banner' && state !== 'off') return null;

  const enable = async () => {
    setBusy(true); setError('');
    try {
      const next = await enablePush();
      setState(next);
      if (next === 'denied') setError(t('push.denied'));
    } catch (err) {
      // No push service in this browser (e.g. Huawei phones without Google services):
      // say so plainly and stop offering it on this device (AYK-044).
      const noService = err?.name === 'AbortError' || err?.name === 'NotSupportedError' || /push service|registration failed|gcm|fcm/i.test(String(err?.message || ''));
      setError(t(noService ? 'push.no_service' : 'push.failed'));
      if (noService) { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) { /* private mode */ } }
    }
    finally { setBusy(false); }
  };
  const iphone = needsHomeScreen();

  if (variant === 'banner') {
    return (
      <div className="bg-primary-soft border-b border-border px-4 py-2.5 text-[13px] text-primary-text flex flex-wrap items-center gap-2 justify-center" data-testid="call-alerts-banner">
        <span>🔔 {t('push.banner')}</span>
        {iphone ? <span className="text-fg-muted">{t('push.iphone_hint')}</span>
          : <Button size="sm" variant="primary" loading={busy} onClick={enable}>{t('push.enable')}</Button>}
        <button type="button" className="text-fg-muted underline" onClick={() => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) { /* private mode */ } setHidden(true); }}>
          {t('push.later')}
        </button>
        {error && <span className="w-full text-center text-danger">{error}</span>}
      </div>
    );
  }

  return (
    <div className="card mb-4" id="call-alerts" data-testid="call-alerts">
      <h3 className="mb-1">🔔 {t('push.title')}</h3>
      <p className="text-[12.5px] text-fg-muted mb-3">{t('push.hint')}</p>
      {state === 'on' && <p className="text-[13px] text-success m-0">✓ {t('push.on')}</p>}
      {state === 'unsupported' && <p className="text-[13px] text-fg-muted m-0">{t('push.unsupported')}</p>}
      {state === 'denied' && <p className="text-[13px] text-danger m-0">{t('push.denied')}</p>}
      {state === 'off' && (iphone
        ? <p className="text-[13px] text-fg-muted m-0">{t('push.iphone_hint')}</p>
        : <Button variant="primary" loading={busy} onClick={enable}>{t('push.enable')}</Button>)}
      {error && state !== 'denied' && <p className="text-[13px] text-danger mt-2 mb-0">{error}</p>}
    </div>
  );
}
