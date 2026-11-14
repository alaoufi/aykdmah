import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { guessLocalSourceLanguage } from '../../utils/localLanguage.js';
import { useChatPrefs } from '../../utils/chatPrefs';

// The other person's message in this reader's language (the site language), shown in place of
// the original (AYK-044, AYK-065), so the conversation reads as if both wrote the same language.
// Instant (AYK-231): the message list already carries saved translations, a new message's
// translation arrives live with it (chat:translation), and the few still missing are fetched
// together in one request. Returns { text, from }.
const known = new Map();
const listeners = new Map();
const NONE = { text: '', from: null };
const UNIQUE_SCRIPT = new Set(['ar', 'ur', 'bn', 'ml', 'am']);

const keyOf = (id, lang) => `${id}:${lang}`;
function store(id, lang, translation, notify = true) {
  const key = keyOf(id, lang);
  const value = translation.same ? NONE : { text: translation.text || '', from: translation.from || null };
  if (known.size > 5000) known.delete(known.keys().next().value);
  known.set(key, value);
  if (notify) for (const listener of listeners.get(key) || []) listener(value);
}

// A translation pushed by the server as soon as the message was sent.
export function receiveTranslation(payload) {
  if (!payload?.messageId || !payload.lang || typeof payload.text !== 'string') return;
  store(payload.messageId, payload.lang, payload);
}

// Saved translations that came with a page of messages.
export function primeTranslations(messages) {
  for (const message of messages || []) {
    const translation = message?.translation;
    if (translation?.lang && !known.has(keyOf(message.id, translation.lang))) store(message.id, translation.lang, translation);
  }
}

// The messages still without a translation, asked for together a moment later.
const queue = new Map();
let timer = null;
function request(message, lang) {
  const group = `${message.conversation_id}:${lang}`;
  if (!queue.has(group)) queue.set(group, new Set());
  queue.get(group).add(Number(message.id));
  clearTimeout(timer);
  timer = setTimeout(flush, 40);
}
function flush() {
  const groups = [...queue.entries()];
  queue.clear();
  for (const [group, idSet] of groups) {
    const [conversationId, lang] = group.split(':');
    const ids = [...idSet].filter(id => !known.has(keyOf(id, lang)));
    for (let i = 0; i < ids.length; i += 100) {
      const part = ids.slice(i, i + 100);
      api.post(`/chat/conversations/${conversationId}/translations`, { ids: part, lang })
        .then(res => {
          // A translation that failed is not kept: it is asked for again next time.
          for (const [id, translation] of Object.entries(res.data?.data || {})) if (!translation.failed) store(id, lang, translation);
        })
        .catch(() => {});
    }
  }
}

export function useAutoTranslation(message, isMine) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ar').split('-')[0];
  const key = keyOf(message?.id, lang);
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  // Only a script that one language alone uses proves the message is already in the reader's
  // language. Latin letters and Devanagari are shared, so those go to the server (AYK-119).
  const guessed = guessLocalSourceLanguage(content);
  const sameScript = guessed && guessed === lang && UNIQUE_SCRIPT.has(lang);
  // Turned off in ⚙️ (AYK-126): the original text only.
  const { translate } = useChatPrefs();
  const needed = Boolean(translate && !isMine && content && message?.id && !String(message.id).startsWith('tmp-')
    && message.message_type !== 'location' && message.message_type !== 'system' && !sameScript && /\p{L}{3,}/u.test(content));
  if (needed && message.translation?.lang === lang && !known.has(key)) store(message.id, lang, message.translation, false);
  const [text, setText] = useState(() => (needed && known.get(key)) || NONE);
  useEffect(() => {
    if (!needed) { setText(NONE); return undefined; }
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key).add(setText);
    if (known.has(key)) setText(known.get(key));
    else { setText(NONE); request(message, lang); }
    return () => {
      const set = listeners.get(key);
      set?.delete(setText);
      if (set && !set.size) listeners.delete(key);
    };
  }, [key, needed]);
  return text;
}

export default function AutoTranslation() { return null; }
