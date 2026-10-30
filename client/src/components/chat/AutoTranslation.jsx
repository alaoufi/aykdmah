import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { guessLocalSourceLanguage } from '../../utils/localLanguage.js';

// The other person's message in this reader's language (the site language), fetched
// automatically (AYK-044). The bubble shows it in place of the original (AYK-065), so the
// conversation reads as if both wrote the same language. A message already in that language,
// or without real words, is left alone.
export function useAutoTranslation(message, isMine) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ar').split('-')[0];
  const [text, setText] = useState('');
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  const guessed = guessLocalSourceLanguage(content);
  const needed = !isMine && content && message?.id && message.message_type !== 'location'
    && !(guessed && guessed === lang) && /\p{L}{3,}/u.test(content);
  useEffect(() => {
    let alive = true;
    setText('');
    if (!needed) return undefined;
    api.get(`/chat/conversations/${message.conversation_id}/messages/${message.id}/translation`, { params: { lang } })
      .then(res => { if (alive && res.data?.data && !res.data.data.same) setText(res.data.data.text); })
      .catch(() => {});
    return () => { alive = false; };
  }, [message?.id, lang, needed]);
  return text;
}

export default function AutoTranslation() { return null; }
