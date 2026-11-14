import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRequestTranslation } from '../services/requestService';
import { needsTranslation } from '../utils/textLanguage';

// A request's title and details in the reader's language, fetched as soon as it is shown
// (AYK-229). `showOriginal` switches back to the requester's own words.
export default function useRequestTranslation(request) {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const title = String(request?.title || '');
  const description = String(request?.description || '');
  const wanted = Boolean(request?.id) && needsTranslation(`${title} ${description}`, lang);
  const [result, setResult] = useState(null);
  const [showOriginal, setShowOriginal] = useState(false);
  useEffect(() => {
    let alive = true;
    setResult(null);
    setShowOriginal(false);
    if (!wanted) return undefined;
    getRequestTranslation(request.id, lang)
      .then(row => { if (alive && row?.translated) setResult(row); })
      .catch(() => {});
    return () => { alive = false; };
  }, [request?.id, lang, wanted, title, description]);
  const translated = Boolean(result) && !showOriginal;
  return {
    title: translated ? result.title || title : title,
    description: translated ? result.description ?? description : description,
    available: Boolean(result), translated, toggle: () => setShowOriginal(value => !value),
  };
}
