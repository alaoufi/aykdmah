import { safeUrl } from '../utils/urlSafety';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getDisputeTimeline, postDisputeMessage, uploadDisputeEvidence,
} from '../services/disputeService';
import { apiError } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { LoadingState } from '../components/common/Spinner';
import Avatar from '../components/common/Avatar';
import { formatTime } from '../utils/formatters';

const STATUS_LABEL = {
  open: 'status_open', under_review: 'status_under_review',
  waiting_response: 'status_waiting_response', escalated: 'status_escalated',
  resolved: 'status_resolved', rejected: 'status_rejected', closed: 'status_closed',
};

const STATUS_TONE = {
  open: 'bg-warning-soft text-warning',
  under_review: 'bg-primary-soft text-primary',
  waiting_response: 'bg-info-soft text-info',
  escalated: 'bg-danger-soft text-danger',
  resolved: 'bg-success-soft text-success',
  rejected: 'bg-danger-soft text-danger',
  closed: 'bg-surface-alt text-fg-subtle',
};

export default function DisputeDetailsPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true);
    getDisputeTimeline(id).then(setData).catch((e) => setErr(apiError(e))).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  if (loading) return <LoadingState />;
  if (err && !data) return <div className="container page max-w-xl mx-auto"><div className="bg-danger-soft text-danger p-4 rounded-card">{err}</div></div>;
  if (!data)   return null;

  const { dispute, statusLogs, messages, evidence } = data;
  const isTerminal = ['resolved', 'rejected', 'closed'].includes(dispute.status);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (busy || (!text.trim() && !files.length)) return;
    setBusy(true);
    setErr('');
    try {
      if (text.trim()) { await postDisputeMessage(id, text.trim()); setText(''); }
      if (files.length) await uploadDisputeEvidence(id, files);
      setText(''); setFiles([]);
      load();
    } catch (e2) { setErr(apiError(e2)); }
    finally { setBusy(false); }
  };

  // Merge timeline items (status + messages + evidence)
  const items = [
    ...statusLogs.map(l => ({ kind: 'status', at: l.created_at, ...l })),
    ...messages.map(m   => ({ kind: 'message', at: m.created_at, ...m })),
    ...evidence.map(e   => ({ kind: 'evidence', at: e.created_at, ...e })),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  return (
    <div className="container page max-w-3xl mx-auto">
      {err && <p role="alert" className="form-error mb-3">{err}</p>}
      <div className="bg-surface border border-border rounded-card p-5 shadow-soft mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h1 className="text-fg text-xl md:text-2xl font-extrabold">{dispute.subject}</h1>
            <p className="text-fg-muted text-sm mt-1">{dispute.description}</p>
          </div>
          <span className={`shrink-0 px-2.5 py-1 rounded-pill text-[11px] font-bold ${STATUS_TONE[dispute.status]}`}>
            {t(`dispute.${STATUS_LABEL[dispute.status]}`)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 text-[11.5px] text-fg-subtle">
          {dispute.frozen ? <span className="px-2 py-0.5 rounded-pill bg-danger-soft text-danger">❄ {t('dispute.frozen')}</span> : null}
          {dispute.chat_locked ? <span className="px-2 py-0.5 rounded-pill bg-warning-soft text-warning">🔒 {t('dispute.chat_locked')}</span> : null}
          {dispute.ratings_allowed && dispute.ratings_allowed !== 'pending' && (
            <span className="px-2 py-0.5 rounded-pill bg-info-soft text-info">
              {t('dispute.ratings_allowed_' + dispute.ratings_allowed, dispute.ratings_allowed)}
            </span>
          )}
        </div>

        {isTerminal && dispute.resolution && (
          <div className="mt-3 p-3 rounded-card bg-success-soft border border-success/30 text-success text-[13px]">
            <strong>{t('dispute.resolution')}:</strong> {dispute.resolution}
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="bg-surface border border-border rounded-card p-5 shadow-soft mb-4">
        <h3 className="font-extrabold text-fg mb-3">{t('dispute.timeline')}</h3>
        <div className="space-y-3">
          {items.length === 0 && (
            <div className="text-center py-6 text-fg-subtle text-sm">{t('chat.no_messages')}</div>
          )}
          {items.map((it, i) => {
            if (it.kind === 'status') {
              return (
                <div key={`s-${i}`} className="flex items-center gap-2 text-[12px] text-fg-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-info" />
                  <span>{t('dispute.status_changed_from')} <strong>{t(`dispute.${STATUS_LABEL[it.from_status] || it.from_status}`, it.from_status)}</strong> {t('dispute.to')} <strong>{t(`dispute.${STATUS_LABEL[it.to_status]}`, it.to_status)}</strong></span>
                  <span className="text-fg-subtle">— {it.author_name}</span>
                  <span className="ms-auto text-fg-subtle">{formatTime(it.at)}</span>
                </div>
              );
            }
            if (it.kind === 'message') {
              const mine = it.author_id === user.id;
              return (
                <div key={`m-${it.id}`} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                  <Avatar src={it.author_avatar} name={it.author_name} size="sm" />
                  <div className={`max-w-[78%] p-3 rounded-card text-[13.5px] ${
                    it.is_internal ? 'bg-warning-soft text-warning border border-warning/30'
                    : mine ? 'bg-primary text-primary-fg' : 'bg-surface-alt text-fg'
                  }`}>
                    <div className="text-[10.5px] opacity-80 mb-1">
                      {it.author_name} · {it.author_role}{it.is_internal ? ' · 🔒 ' + t('dispute.internal_note') : ''}
                    </div>
                    <div className="whitespace-pre-wrap">{it.body}</div>
                    <div className="text-[10px] opacity-70 mt-1 text-end">{formatTime(it.at)}</div>
                  </div>
                </div>
              );
            }
            // evidence
            const isImg = it.kind === 'evidence' && (it.file_type || '').startsWith('image/');
            const isAudio = it.kind === 'evidence' && (it.file_type || '').startsWith('audio/');
            return (
              <div key={`e-${it.id}`} className="flex gap-2 items-start">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2.5" />
                <div className="flex-1">
                  <div className="text-[11.5px] text-fg-muted mb-1">
                    📎 {it.uploaded_by_name} · {formatTime(it.at)}
                  </div>
                  {isImg ? (
                    <a href={safeUrl(it.file_url) || undefined} target="_blank" rel="noopener noreferrer">
                      <img src={safeUrl(it.file_url) || undefined} alt="" className="max-w-[260px] rounded-card" />
                    </a>
                  ) : isAudio ? (
                    <audio controls src={safeUrl(it.file_url) || undefined} className="w-full max-w-xs" />
                  ) : (
                    <a href={safeUrl(it.file_url) || undefined} target="_blank" rel="noopener noreferrer"
                       className="text-primary underline text-[13px]">{it.file_name}</a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!isTerminal && (
        <form onSubmit={sendMessage} className="bg-surface border border-border rounded-card p-4 shadow-soft space-y-2">
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('dispute.write_clarification')}
            className="w-full px-3 py-2 rounded-card border border-border bg-surface-alt text-[14px]"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="file" multiple
              accept="image/*,application/pdf,audio/*"
              onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 4))}
              className="text-[12px] flex-1 min-w-[140px]"
            />
            <button type="submit" disabled={busy}
              className="px-4 py-2 rounded-pill text-primary-fg text-[13px] font-bold bg-primary-grad disabled:opacity-60">
              {busy ? t('common.loading') : t('common.send')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
