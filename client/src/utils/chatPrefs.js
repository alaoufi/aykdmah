import { useEffect, useState } from 'react';

// The reader's own message settings (AYK-126), kept on this device: the text size of the
// messages and whether the other side's messages are shown translated.
const KEY = 'aykdmh_chat_prefs';
export const CHAT_SIZES = { s: 14, m: 16, l: 19, xl: 22, xxl: 26 };
const DEFAULTS = { size: 'm', translate: true, bold: false };
const EVENT = 'aykdmh-chat-prefs';

export function readChatPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      bold: typeof saved.bold === 'boolean' ? saved.bold : false,
      size: CHAT_SIZES[saved.size] ? saved.size : DEFAULTS.size,
      translate: typeof saved.translate === 'boolean' ? saved.translate : DEFAULTS.translate,
    };
  } catch (_) { return { ...DEFAULTS }; }
}

function apply(prefs) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--chat-unread-font-weight', prefs.bold ? '700' : '600');
  document.documentElement.style.setProperty('--chat-font-weight', prefs.bold ? '700' : '400');
  document.documentElement.style.setProperty('--chat-font', `${CHAT_SIZES[prefs.size]}px`);
}

export function saveChatPrefs(change) {
  const next = { ...readChatPrefs(), ...change };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (_) { /* private mode: this visit only */ }
  apply(next);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  return next;
}

export function useChatPrefs() {
  const [prefs, setPrefs] = useState(readChatPrefs);
  useEffect(() => {
    apply(prefs);
    const onChange = e => setPrefs(e.detail || readChatPrefs());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);
  return prefs;
}
