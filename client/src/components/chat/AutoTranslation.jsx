import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import { guessLocalSourceLanguage } from '../../utils/localLanguage.js';

// The other person's message, translated into the language this user signed up with
// (the site language), automatically and without a button (AYK-044). A message that
// is already in that language is left alone.
export default function AutoTranslation({ message, isMine }) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ar').split('-')[0];
  const [text, setText] = useState('');
  const content = typeof message?.content === 'string' ? message.content.trim() : '';
  const guessed = guessLocalSourceLanguage(content);
  const needed = !isMine && content && message?.id && message.message_type !== 'location'
    && !(guessed && guessed === lang) && !(lang === 'ar' && guessed === 'ar');
  useEffect(() => {
    let alive = true;
    setText('');
    if (!needed) return undefined;
    api.get(`/chat/conversations/${message.conversation_id}/messages/${message.id}/translation`, { params: { lang } })
      .then(res => { if (alive && res.data?.data && !res.data.data.same) setText(res.data.data.text); })
      .catch(() => {});
    return () => { alive = false; };
  }, [message?.id, lang, needed]);
  if (!text) return null;
  return <div className="auto-translation" data-testid="auto-translation" style={{ fontSize: 13, opacity: 0.85, marginTop: 4, borderTop: '1px dashed currentColor', paddingTop: 4 }}>🌐 {text}<span className="sr-only"> ({t('chat.translated')})</span></div>;
}
