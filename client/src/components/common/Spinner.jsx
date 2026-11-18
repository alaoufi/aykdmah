import { useTranslation } from 'react-i18next';
import loadingAnim from '../../assets/loading-anim.webp';

export default function Spinner({ large = false }) {
  const { t } = useTranslation();
  return <div className={`spinner ${large ? 'spinner-lg' : ''}`} aria-label={t('common.loading')} />;
}

export function LoadingState({ text }) {
  const { t } = useTranslation();
  return (
    <div className="loading-state">
      {/* The owner's animated mark while a screen loads (AYK-257). With the device's "reduce motion"
          setting the picture is not shown at all (a frozen frame of it looks broken; the owner's
          decision): the plain ring and the text stay, as before. The empty source keeps the
          picture from being downloaded there. */}
      <picture className="loading-mark">
        <source media="(prefers-reduced-motion: reduce)" srcSet="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" />
        <img src={loadingAnim} width="96" height="96" alt="" decoding="async" />
      </picture>
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
