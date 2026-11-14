import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRequestTranslation } from '../services/requestService';
import { needsTranslation } from '../utils/textLanguage';
import { localizedJoinedName } from '../utils/localizeJoined';

// A request's title and details in the reader's language (AYK-229). Instant (AYK-231): the request
// lists and pages already carry the saved translation; only one not yet made is fetched, once per
// request and language. A title the site made from the service name is shown as that name in the
// reader's language instead of a machine translation. `toggle` shows the requester's own words.
const known = new Map();

export default function useRequestTranslation(request) {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage || 'ar').split('-')[0];
  const rawTitle = String(request?.title || '');
  const rawDescription = String(request?.description || '');
  // «صيانة منزلية» made from the service (or profession) name when no title was written.
  const autoTitle = [['service', request?.service_name], ['category', request?.category_name]]
    .find(([, name]) => name && rawTitle.trim() === String(name).trim());
  const title = autoTitle ? localizedJoinedName(request, autoTitle[0], lang) || rawTitle : rawTitle;
  const description = autoTitle && rawDescription.trim() === rawTitle.trim() ? title : rawDescription;
  const text = `${autoTitle ? '' : rawTitle} ${description.trim() === title.trim() ? '' : rawDescription}`.trim();
  const wanted = Boolean(request?.id) && needsTranslation(text, lang);
  const key = `${request?.id}:${lang}`;
  const given = request?.translation?.lang === lang ? request.translation : null;
  if (given && !known.has(key)) known.set(key, { ...given, translated: true });
  const [result, setResult] = useState(() => (wanted ? known.get(key) || null : null));
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => {
    let alive = true;
    setShowOriginal(false);
    if (!wanted) { setResult(null); return undefined; }
    if (known.has(key)) { setResult(known.get(key)); return undefined; }
    setResult(null);
    getRequestTranslation(request.id, lang)
      .then(row => {
        if (!row || row.error) return;
        const value = row.translated ? row : { translated: false };
        if (known.size > 2000) known.delete(known.keys().next().value);
        known.set(key, value);
        if (alive) setResult(value);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [key, wanted]);
  const available = Boolean(result?.translated);
  const translated = available && !showOriginal;
  return {
    title: translated && !autoTitle ? result.title || title : title,
    description: translated ? (description.trim() === title.trim() && !autoTitle ? result.title : result.description ?? description) : description,
    available, translated, toggle: () => setShowOriginal(value => !value),
  };
}
