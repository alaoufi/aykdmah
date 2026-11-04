import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { searchMessages } from '../../services/chatService';

export default function MessageSearch({ conversationId, onSelect }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [before, setBefore] = useState(null);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(false);
  const [loading,setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    setError(false);
    setRows([]);setLoading(true);
    const timer = setTimeout(() => searchMessages(conversationId, q, before).then(items => { if (alive) setRows(items); }).catch(() => { if (alive) setError(true); }).finally(() => {if (alive) setLoading(false);}), 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [conversationId, q, before]);
  return <div className="p-2 border-b border-border">
    <input data-testid="message-search" className={`input ${error ? 'border-danger text-danger' : ''}`} aria-invalid={error} aria-describedby={error ? 'message-search-error' : undefined} type="search" aria-label={t('chat.search_messages')} placeholder={t('chat.search_messages')} value={q} maxLength={200} onChange={e => { setQ(e.target.value); setBefore(null); }} />
    {error && <p id="message-search-error" role="alert" className="m-0 mt-1 text-[13px] text-danger">{t('errors.generic')}</p>}
    {!!q.trim() && <div className="max-h-40 overflow-y-auto">
      {rows.map(row => <button type="button" data-testid={`search-result-${row.id}`} key={row.id} className="block text-start w-full p-2" onClick={() => onSelect(row.id)}>{row.sender_name} · {row.content}</button>)}
      {loading && <p>{t('common.loading')}</p>}
      {!loading && !rows.length && !error && <p>{t('common.none')}</p>}
      {rows.length === 30 && <button type="button" onClick={() => setBefore(rows.at(-1).id)}>{t('chat.older_results')}</button>}
      {before && <button type="button" onClick={() => setBefore(null)}>{t('chat.latest_messages')}</button>}
    </div>}
  </div>;
}
