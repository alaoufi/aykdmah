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
  // is still loading after a second shows the owner's animated mark (AYK-257), so it is never a
  // flash on fast screens, and is not even downloaded for them.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowAfter);
    return () => clearTimeout(timer);
  }, [slowAfter]);
  return (
    <div className="loading-state">
      {slow ? (
        /* With the device's "reduce motion" setting the picture is not shown at all (a frozen frame
           of it looks broken; the owner's decision): the ring stays. The empty source keeps the
           picture from being downloaded there. */
        <picture className="loading-mark" data-testid="loading-mark">
          <source media="(prefers-reduced-motion: reduce)" srcSet="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
          <img src={loadingAnim} width="96" height="96" alt="" decoding="async" />
        </picture>
      ) : <Spinner large />}
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
