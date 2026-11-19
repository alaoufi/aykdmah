import { useEffect } from 'react';
import i18n, { LANG_STORAGE_KEY } from '../i18n';

// The admin area is in Arabic only (owner's decision, AYK-295). The visitor's own language for the
// site is kept: it is put back in storage at once, and in use again when they leave the area.
export default function useArabicOnly() {
  useEffect(() => {
    const before = (i18n.resolvedLanguage || i18n.language || 'ar').split(/[-_]/)[0];
    let saved = null;
    try { saved = localStorage.getItem(LANG_STORAGE_KEY); } catch (_) { /* private mode */ }
    if (before !== 'ar') {
      i18n.changeLanguage('ar').finally(() => {
        try { if (saved) localStorage.setItem(LANG_STORAGE_KEY, saved); } catch (_) { /* private mode */ }
      });
    }
    return () => { if (before !== 'ar') i18n.changeLanguage(before); };
  }, []);
}
