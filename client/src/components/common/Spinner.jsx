import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import loadingAnim from '../../assets/loading-anim.webp';

export default function Spinner({ large = false }) {
  const { t } = useTranslation();
  return <div className={`spinner ${large ? 'spinner-lg' : ''}`} aria-label={t('common.loading')} />;
}

// After how long a wait the animated mark replaces the plain ring (the owner's decision, AYK-263).
export const SLOW_LOADING_MS = 1000;

export function LoadingState({ text, slowAfter = SLOW_LOADING_MS }) {
  const { t } = useTranslation();
  // A screen that opens at once keeps the plain ring and «جارٍ التحميل…», as before. Only one that
  // is still loading after a second shows the owner's animated mark (AYK-257/263), so it is never a
  // flash on fast screens, and is not even downloaded for them.
  // No blink when it comes (AYK-265): the space is the mark's size from the start, so nothing
  // moves; the ring stays until the picture has fully arrived, then the two cross-fade.
  // With the device's "reduce motion" setting the picture is never shown (owner's decision).
  const [slow, setSlow] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) return undefined;
    const timer = setTimeout(() => setSlow(true), slowAfter);
    return () => clearTimeout(timer);
  }, [slowAfter]);
  return (
    <div className="loading-state">
      <div className={`loading-box${ready ? ' is-ready' : ''}`}>
        <Spinner large />
        {slow && (
          <span className="loading-mark" data-testid="loading-mark">
            <img src={loadingAnim} width="96" height="96" alt="" decoding="async" onLoad={() => setReady(true)} />
          </span>
        )}
      </div>
      <div style={{ marginTop: 12 }} role="status">{text || t('common.loading')}</div>
    </div>
  );
}

export function EmptyState({ title, body = '', icon = '📭' }) {
  const { t } = useTranslation();
  return (
    <div className="empty-state">
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <h3>{title || t('common.none')}</h3>
      {body && <p>{body}</p>}
    </div>
  );
}

export function ErrorState({ message }) {
  const { t } = useTranslation();
  return <div className="error-state">{message || t('errors.generic')}</div>;
}
