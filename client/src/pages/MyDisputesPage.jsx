import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listDisputes } from '../services/disputeService';
import { LoadingState } from '../components/common/Spinner';
import { formatRelativeTime } from '../utils/formatters';

const STATUS_TONE = {
  open: 'bg-warning-soft text-warning',
  under_review: 'bg-primary-soft text-primary',
  waiting_response: 'bg-info-soft text-info',
  escalated: 'bg-danger-soft text-danger',
  resolved: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
  closed: 'bg-surface-alt text-fg-subtle',
};
const STATUS_KEY = (s) => `dispute.status_${s}`;

export default function MyDisputesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let current = true;
    listDisputes({ limit: 50 }).then((r) => { if (current) setItems(r.data || []); })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  if (loading) return <LoadingState />;

  return (
    <div className="container page max-w-3xl mx-auto">
      <h1 className="text-fg text-2xl md:text-3xl font-extrabold mb-1">{t('dispute.my_disputes')}</h1>
      {error && <p role="alert" className="form-error">{t('errors.generic')}</p>}
      <p className="text-fg-muted text-sm mb-5">{t('dispute.my_disputes_hint')}</p>

      {items.length === 0 ? (
        <div className="bg-surface border border-border rounded-card p-8 text-center text-fg-muted">
          <div className="text-5xl mb-2 opacity-70">⚖️</div>
          <p>{t('dispute.none_yet')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <Link key={d.id} to={`/disputes/${d.id}`}
              className="block bg-surface border border-border rounded-card p-4 shadow-soft hover:shadow-card transition no-underline">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="text-[15px] font-bold text-fg">{d.subject}</div>
                  <div className="text-[12px] text-fg-muted mt-0.5">
                    {d.request_title || '—'}
                  </div>
                </div>
                <span className={`shrink-0 px-2.5 py-0.5 rounded-pill text-[10.5px] font-bold ${STATUS_TONE[d.status]}`}>
                  {t(STATUS_KEY(d.status))}
                </span>
              </div>
              <div className="text-[11px] text-fg-subtle">{formatRelativeTime(d.opened_at)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
