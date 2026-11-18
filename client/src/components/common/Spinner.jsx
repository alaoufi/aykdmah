import { useTranslation } from 'react-i18next';
import loadingAnim from '../../assets/loading-anim.webp';
import loadingStill from '../../assets/loading-still.webp';

export default function Spinner({ large = false }) {
  const { t } = useTranslation();
  return <div className={`spinner ${large ? 'spinner-lg' : ''}`} aria-label={t('common.loading')} />;
}

export function LoadingState({ text }) {
  const { t } = useTranslation();
  return (
    <div className="loading-state">
      {/* The owner's animated mark while a screen loads (AYK-257): a still frame for people who
          asked their device for less motion, and the ring until the picture itself arrives. */}
      <picture className="loading-mark">
        <source media="(prefers-reduced-motion: reduce)" srcSet={loadingStill} />
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
