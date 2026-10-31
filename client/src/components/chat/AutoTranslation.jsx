import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { guessLocalSourceLanguage } from '../../utils/localLanguage.js';

// The other person's message in this reader's language (the site language), fetched
// automatically (AYK-044). The bubble shows it in place of the original (AYK-065), so the
// conversation reads as if both wrote the same language. A message already in that language,
// or without real words, is left alone.
// Translations already fetched in this session: reopening a chat shows them at once.
const fetched = new Map();
const UNIQUE_SCRIPT = new Set(['ar', 'ur', 'bn', 'ml', 'am']);

export function useAutoTranslation(message, isMine) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ar').split('-')[0];
  const cacheKey = `${message?.id}:${lang}`;
  const [text, setText] = useState(() => fetched.get(cacheKey) || '');
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  // Only a script that one language alone uses proves the message is already in the reader's
  // language. Latin letters (English, Filipino, Indonesian, Turkish) and Devanagari (Hindi,
  // Nepali) are shared, so those go to the server, which detects the language itself (AYK-119).
  const guessed = guessLocalSourceLanguage(content);
  const sameScript = guessed && guessed === lang && UNIQUE_SCRIPT.has(lang);
  const needed = !isMine && content && message?.id && message.message_type !== 'location' && message.message_type !== 'system'
    && !sameScript && /\p{L}{3,}/u.test(content);
  useEffect(() => {
    let alive = true;
    if (!needed) { setText(''); return undefined; }
    if (fetched.has(cacheKey)) { setText(fetched.get(cacheKey)); return undefined; }
    setText('');
    api.get(`/chat/conversations/${message.conversation_id}/messages/${message.id}/translation`, { params: { lang } })
      .then(res => {
        if (!res.data?.data) return;
        const translated = res.data.data.same ? '' : res.data.data.text;
        if (fetched.size > 2000) fetched.delete(fetched.keys().next().value);
        fetched.set(cacheKey, translated);
        if (alive) setText(translated);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [message?.id, lang, needed]);
  return text;
}

export default function AutoTranslation() { return null; }
