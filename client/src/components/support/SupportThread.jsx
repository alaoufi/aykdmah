import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../utils/formatters';
import { apiError } from '../../services/api';

// One message thread with the administration (AYK-046), shared by the writer's page
// and the admin inbox. `asAdmin` decides which side is "mine".
// `collapsedReply` (AYK-330, the admin inbox): only a «رد» button shows; pressing it opens the writing box.
export default function SupportThread({ ticket, asAdmin = false, onReply, collapsedReply = false }) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [writing, setWriting] = useState(!collapsedReply);
  const [problem, setProblem] = useState('');
  const send = async event => {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true); setProblem('');
    try { await onReply(body.trim()); setBody(''); if (collapsedReply) setWriting(false); } catch (err) { setProblem(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3" data-testid="support-thread">
      <div className="space-y-2">
        {ticket.messages.map(message => {
          const mine = Boolean(Number(message.from_admin)) === asAdmin;
          return (
            <div key={message.id} className={`max-w-[85%] rounded-card px-3 py-2 text-[14px] whitespace-pre-wrap ${mine ? 'ms-auto bg-primary-soft' : 'me-auto bg-surface-alt'}`}>
              {/* In the admin inbox the writer's name is in the page's heading, not on every message. */}
              {(Number(message.from_admin) || !collapsedReply) ? (
                <div className="text-[11.5px] font-bold text-fg-muted mb-0.5">
                  {Number(message.from_admin) ? `🛡️ ${t('support.from_admin')}` : (message.sender_name || ticket.full_name)}
                </div>
              ) : null}
              {message.body}
              <div className="text-[10.5px] text-fg-muted mt-1">{formatDate(message.created_at, true)}</div>
            </div>
          );
        })}
      </div>
      {ticket.status === 'closed' && !asAdmin
        ? <p className="text-[13px] text-fg-muted m-0">{t('support.closed_hint')}</p>
        : !writing ? (
          <button type="button" className="btn btn-primary" onClick={() => setWriting(true)} data-testid="support-open-reply">↩️ {t('review.reply')}</button>
        ) : (
          <form onSubmit={send} className="flex gap-2 items-end">
            <textarea className="input flex-1" autoFocus={collapsedReply} rows={collapsedReply ? 3 : 2} maxLength={4000} value={body} onChange={e => setBody(e.target.value)}
              placeholder={t('support.reply_ph')} data-testid="support-reply" />
            <button type="submit" className="btn btn-primary" disabled={busy || !body.trim()}>{t('support.send')}</button>
          </form>
        )}
      {problem && <p role="alert" className="form-error">{problem}</p>}
    </div>
  );
}
