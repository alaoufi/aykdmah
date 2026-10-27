import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useCall } from '../../context/CallContext';
import { callEligibility } from '../../services/callService';

// Voice and video call buttons. With a conversationId the server checks permission
// when the call starts; with only a userId the shared conversation is looked up first,
// and the buttons explain why calling is not possible yet.
export default function CallButtons({ conversationId, userId, compact = false }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { start, call } = useCall();
  const [target, setTarget] = useState(conversationId || null);
  const [state, setState] = useState(conversationId ? 'ready' : 'checking');

  useEffect(() => {
    if (conversationId) { setTarget(conversationId); setState('ready'); return undefined; }
    if (!user || !userId || Number(userId) === Number(user.id)) { setState(user ? 'hidden' : 'login'); return undefined; }
    let current = true;
    setState('checking');
    callEligibility(userId)
      .then(result => {
        if (!current) return;
        if (!result.configured) setState('unavailable');
        else if (result.allowed) { setTarget(result.conversation_id); setState('ready'); }
        else setState('not_allowed');
      })
      .catch(() => { if (current) setState('unavailable'); });
    return () => { current = false; };
  }, [conversationId, userId, user]);

  if (state === 'hidden') return null;
  const disabled = state !== 'ready' || !!call;
  const button = 'px-3 py-1.5 rounded-pill text-[12.5px] border border-border bg-surface-alt disabled:opacity-50';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={button} disabled={disabled} onClick={() => start(target, 'audio')}
        aria-label={t('calls.voice_call')} title={t('calls.voice_call')}>📞{compact ? '' : ` ${t('calls.voice_call')}`}</button>
      <button type="button" className={button} disabled={disabled} onClick={() => start(target, 'video')}
        aria-label={t('calls.video_call')} title={t('calls.video_call')}>🎥{compact ? '' : ` ${t('calls.video_call')}`}</button>
      {!compact && state !== 'ready' && state !== 'checking' && (
        <span className="text-[11.5px] text-fg-subtle">{t(`calls.state.${state}`)}</span>
      )}
    </div>
  );
}
