import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { setUserBlocked } from '../../services/chatService';

// An error shown where a contact failed (AYK-111). When the reason is "you blocked this person",
// the way out is right there: "✅ Unblock", without having to find a chat first.
export default function BlockedNotice({ message, otherId, onUnblocked, className = 'form-error mt-1 text-[12px]' }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  if (!message) return null;
  const mine = otherId && message === t('errors.blocked_by_you');
  const unblock = async () => {
    setBusy(true);
    try { await setUserBlocked(otherId, false); onUnblocked?.(); } catch (_) { /* the message stays */ } finally { setBusy(false); }
  };
  return (
    <div role="alert" className={`${className} flex items-center gap-2 flex-wrap`} data-testid="contact-problem">
      <span className="flex-1">{message}</span>
      {mine && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={unblock} data-testid="notice-unblock">✅ {t('chat.unblock')}</button>}
    </div>
  );
}
