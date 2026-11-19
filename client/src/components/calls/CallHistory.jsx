import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCall } from '../../context/CallContext';
import { callHistory } from '../../services/callService';
import { formatRelativeTime } from '../../utils/formatters';

// Calls linked to a request (metadata only; nothing is recorded).
export default function CallHistory({ requestId }) {
  const { t } = useTranslation();
  const { phase } = useCall();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!requestId || (phase !== 'idle' && phase !== 'ended')) return undefined;
    let current = true;
    callHistory({ request_id: requestId }).then(rows => { if (current) setItems(rows); }).catch(() => {});
    return () => { current = false; };
  }, [requestId, phase]);

  if (!items.length) return null;
  const length = s => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
  return (
    <div className="mt-4">
      <h3 className="font-bold text-fg text-[14px] mb-2">{t('calls.history')}</h3>
      <ul className="space-y-1 text-[12.5px]">
        {items.map(c => (
          <li key={c.id} className="flex justify-between gap-2 text-fg-muted">
            <span>{c.call_type === 'video' ? '🎥' : '📞'} {t(`calls.direction.${c.direction}`)} · {t(`calls.outcome.${c.status}`)}</span>
            <span>{length(c.duration_seconds)} {formatRelativeTime(c.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
