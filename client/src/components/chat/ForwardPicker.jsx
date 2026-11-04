import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listConversations, forwardMessages } from '../../services/chatService';

export default function ForwardPicker({ sourceId, messageIds, onClose, onDone }) {
  const { t } = useTranslation();
  const alive = useRef(true);
  useEffect(() => {alive.current=true;return () => {alive.current=false;};},[]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const operationId = useRef(null);
  if (!operationId.current) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
    const hex=[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
    operationId.current=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  const sending = useRef(false);
  const [completed,setCompleted] = useState([]);
  const pending = selected.filter(id=>!completed.includes(id));
  const [error, setError] = useState('');
  const [listError,setListError] = useState(false);
  useEffect(() => {
    let alive = true;
    setLoading(true);setListError(false);
    listConversations({ q, page, limit: 20 }).then(items => { if (alive) setRows(items); })
      .catch(() => { if (alive) {setRows([]);setListError(true);} })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [q, page, t]);
  const send = async () => {
    if (sending.current || !pending.length) return;
    sending.current=true;setBusy(true);setError('');
    try {
      const result = await forwardMessages(Number(sourceId), messageIds, pending, operationId.current);
      if (!alive.current) return;
      const done=[...new Set([...completed,...result.results.filter(row=>row.success).map(row=>row.conversation_id)])];
      setCompleted(done);
      if (selected.some(id=>!done.includes(id))) {setError(t('chat.forward_partial'));return;}
      onDone(done.length * messageIds.length);
    } catch (_) { if (alive.current) setError(t('errors.generic')); }
    finally { sending.current=false;if (alive.current) setBusy(false); }
  };
  return <div data-testid="forward-dialog" className="chat-audience" role="dialog" aria-modal="true" aria-label={t('requester.forward_title')}>
    <strong>{t('chat.forward_selected', { count: messageIds.length })}</strong>
    <input data-testid="forward-recipient-search" className={`input ${listError ? 'border-danger text-danger' : ''}`} aria-invalid={listError} aria-describedby={listError ? 'forward-search-error' : undefined} aria-label={t('common.search')} placeholder={t('common.search')} value={q} maxLength={200} disabled={busy} onChange={e => { setQ(e.target.value); setPage(1); }} />
    {listError && <p id="forward-search-error" role="alert" className="m-0 text-[13px] text-danger">{t('errors.generic')}</p>}
    <fieldset className={`max-h-48 overflow-y-auto w-full min-w-0 ${error ? 'border border-danger rounded-card' : ''}`} aria-invalid={Boolean(error)} aria-describedby={error ? 'forward-recipient-error' : undefined}>
      <legend className="sr-only">{t('requester.forward_title')}</legend>
      {!loading && rows.filter(c => Number(c.id) !== Number(sourceId) && c.can_send).map(c => <label key={c.id} className="flex items-center gap-2 p-2">
        <input data-testid={`forward-recipient-${c.id}`} type="checkbox" disabled={busy || completed.includes(c.id) || (!selected.includes(c.id) && selected.length >= 20)} checked={selected.includes(c.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, c.id] : ids.filter(id => id !== c.id))} />
        <span>{c.other_user?.full_name || '—'} · {c.other_user?.referral_code} · {c.request_title}</span>
      </label>)}
      {loading && <p>{t('common.loading')}</p>}
    </fieldset>
    {error && <p id="forward-recipient-error" role="alert" className="m-0 text-[13px] text-danger">{error}</p>}
    <div className="flex gap-2 flex-wrap">
      <button type="button" disabled={busy || page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
      <span>{page}</span><button type="button" disabled={busy || rows.length < 20} onClick={() => setPage(p => p + 1)}>›</button>
      <button type="button" data-testid="forward-submit" className="btn btn-primary btn-sm" disabled={busy || !pending.length} onClick={send}>{t('common.send')} ({pending.length})</button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={onClose}>{t('common.close')}</button>
    </div>
  </div>;
}
