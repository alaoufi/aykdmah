import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { listCategories } from '../services/serviceService';
import { localizedName } from '../utils/localize';

// AYK-434 (the owner: «إذا تحوّل إلى المحادثات أو الواتس اب: أنا ..... (طالب خدمة، فني ...) أتواصل
// معك حسب طلبك حول ....»): the first words written for the person when they open a chat or WhatsApp
// from a contact button. Who I am (my name and what I do: my profession, or «طالب خدمة»), and what
// it is about. They can change it before sending.
//   intro({ request })       a provider about the other person's request: «… بخصوص طلبك: <title>»
//   intro({ myRequest })     a requester about their own request:       «… بخصوص طلبي: <title>»
//   intro({ service })       about a profession or service:            «… بخصوص <service>»
//   intro()                  just who I am.
export default function useContactIntro() {
  const { t, i18n } = useTranslation();
  const { user, provider } = useAuth();
  const [profession, setProfession] = useState('');
  const lang = i18n.resolvedLanguage || 'ar';
  useEffect(() => {
    let alive = true;
    if (user?.role !== 'provider' || !provider?.category_id) { setProfession(''); return undefined; }
    listCategories().then(rows => {
      const row = (rows || []).find(c => Number(c.id) === Number(provider.category_id));
      if (alive) setProfession(row ? localizedName(row, lang) : '');
    }).catch(() => {});
    return () => { alive = false; };
  }, [user?.role, provider?.category_id, lang]);
  return ({ request = null, myRequest = null, service = null } = {}) => {
    if (!user) return '';
    const name = String(user.full_name || '').trim().split(/\s+/).slice(0, 2).join(' ') || t('contact_intro.someone');
    const who = user.role === 'provider' ? (profession || t('contact_intro.provider')) : t('contact_intro.requester');
    if (request) return t('contact_intro.about_request', { name, who, title: request });
    if (myRequest) return t('contact_intro.about_my_request', { name, who, title: myRequest });
    if (service) return t('contact_intro.about_service', { name, who, service });
    return t('contact_intro.general', { name, who });
  };
}

// The chat page takes the text kept here when it opens the conversation within a minute.
const KEY = 'ayk_chat_intro';
export function keepChatIntro(text) {
  try { if (text) sessionStorage.setItem(KEY, JSON.stringify({ text, at: Date.now() })); } catch (_) { /* private mode */ }
}
// Read without removing (a render may run twice); the chat page forgets it once shown.
export function peekChatIntro() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return saved && Date.now() - Number(saved.at) < 60 * 1000 ? String(saved.text || '') : '';
  } catch (_) { return ''; }
}
export function forgetChatIntro() { try { sessionStorage.removeItem(KEY); } catch (_) { /* private mode */ } }
