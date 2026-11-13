import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listSupport, createSupport, getSupport, replySupport } from '../services/supportService';
import { useNotifications } from '../hooks/useNotifications';
import { apiError } from '../services/api';
import { formatDate, truncate } from '../utils/formatters';
import SupportThread from '../components/support/SupportThread';
import { LoadingState } from '../components/common/Spinner';

const TOPICS = ['support', 'suggestion', 'admin'];
const ICONS = { support: '🛠️', suggestion: '💡', admin: '🏛️' };

// Messages to the administration (AYK-046): technical support, suggestions, or the
// administration itself. Each message is a thread; replies are counted as unread.
export default function SupportPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const [items, setItems] = useState(null);
  const [ticket, setTicket] = useState(null);
  const [topic, setTopic] = useState('support');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let alive = true;
    setTicket(null);
    if (id) getSupport(id).then(row => { if (alive) { setTicket(row); refresh?.(); } }).catch(err => setProblem(apiError(err)));
    else listSupport().then(rows => { if (alive) setItems(rows); }).catch(() => setItems([]));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const send = async event => {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setProblem('');
    try { const created = await createSupport(topic, body.trim()); setBody(''); navigate(`/support/${created.id}`); }
    catch (err) { setProblem(apiError(err)); } finally { setBusy(false); }
  };

  if (id) {
    return (
      <div className="container page max-w-3xl">
        <Link to="/support" className="text-[13px] font-semibold text-primary">← {t('support.title')}</Link>
        {problem && <p role="alert" className="form-error">{problem}</p>}
        {!ticket ? <LoadingState /> : (
          <div className="card mt-3">
            <h2 className="mt-0 text-lg">{ICONS[ticket.topic]} {t(`support.topic_${ticket.topic}`)} · <span className="text-fg-muted text-[13px]">{t(`support.status_${ticket.status}`)}</span></h2>
            <SupportThread ticket={ticket} onReply={async text => setTicket(await replySupport(ticket.id, text))} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container page max-w-3xl space-y-4" data-testid="support-page">
      <div>
        <h2 className="m-0">📨 {t('support.title')}</h2>
        <p className="text-[13px] text-fg-muted mt-1 mb-0">{t('support.hint')}</p>
      </div>
      <form onSubmit={send} className="card space-y-3">
        <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={t('support.topic')}>
          {TOPICS.map(key => (
            <button key={key} type="button" role="radio" aria-checked={topic === key} onClick={() => setTopic(key)}
              className={`px-3 py-1.5 rounded-pill border text-[13px] font-semibold ${topic === key ? 'bg-primary text-primary-fg border-primary' : 'bg-surface border-border text-fg-muted'}`}>
              {ICONS[key]} {t(`support.topic_${key}`)}
            </button>
          ))}
        </div>
        <textarea className="input" rows={4} maxLength={4000} value={body} onChange={e => setBody(e.target.value)}
          placeholder={t('support.body_ph')} data-testid="support-body" />
        <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>{t('support.send')}</button>
        {problem && <p role="alert" className="form-error">{problem}</p>}
      </form>
      <div>
        <h3 className="text-base mb-2">{t('support.my_messages')}</h3>
        {items === null ? <LoadingState /> : items.length === 0 ? <p className="text-fg-muted text-[13px]">{t('support.none')}</p> : (
          <div className="space-y-2">
            {items.map(row => (
              <Link key={row.id} to={`/support/${row.id}`} className="card flex items-center gap-3 no-underline text-inherit" data-testid="support-item">
                <span className="text-xl">{ICONS[row.topic]}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[14px]">{t(`support.topic_${row.topic}`)} · <span className="text-fg-muted font-normal text-[12px]">{t(`support.status_${row.status}`)}</span></div>
                  <div className="text-[13px] text-fg-muted truncate">{truncate(row.last_body || '', 90)}</div>
                  <div className="text-[11px] text-fg-muted">{formatDate(row.updated_at, true)}</div>
                </div>
                {Number(row.user_unread) > 0 && <span className="badge badge-primary">{row.user_unread}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
