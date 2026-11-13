import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AdminPageHeader from '../../components/admin/AdminPageHeader';
import AdminButton from '../../components/admin/AdminButton';
import EmptyState from '../../components/admin/EmptyState';
import { useAdminConfirmation } from '../../components/admin/confirmAdminChange';
import { adminListTexts, adminSaveText, adminResetText } from '../../services/adminService';
import { apiError } from '../../services/api';
import { SUPPORTED_LANGUAGES, DEFAULT_TEXTS, applyTextOverrides, getLanguageDir } from '../../i18n';
import { flattenTexts, matchesText, samePlaceholders, textPlaceholders } from '../../utils/uiTexts';

const PAGE = 30;

// Every interface text of the site and the app, editable per language (AYK-210). The built-in
// text stays in the locale files; an edit is stored on the server and «استرجاع» deletes it.
export default function AdminTextsPage() {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  // The owner edits the Arabic text only; saving translates it into every other language (AYK-220).
  const lang = 'ar';
  const cascade = true;
  const [search, setSearch] = useState('');
  const [editedOnly, setEditedOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const loadVersion = useRef(0);

  useEffect(() => {
    const version = ++loadVersion.current;
    adminListTexts()
      .then(rows => {
        if (version !== loadVersion.current) return;
        const next = {};
        for (const row of rows || []) (next[row.lang] ||= {})[row.text_key] = row.text_value;
        setOverrides(next);
      })
      .catch(e => { if (version === loadVersion.current) setMsg({ type: 'error', text: apiError(e) }); })
      .finally(() => { if (version === loadVersion.current) setLoading(false); });
  }, []);

  useEffect(() => { setLimit(PAGE); }, [lang, search, editedOnly]);

  const all = useMemo(() => flattenTexts(DEFAULT_TEXTS[lang]), [lang]);
  const langOverrides = overrides[lang] || {};
  const matches = useMemo(() => all.filter(([key, original]) =>
    (!editedOnly || key in langOverrides) && matchesText(search, key, original, langOverrides[key])),
  [all, search, editedOnly, langOverrides]);

  // Applies { lang: { key: text | null } } to the page and to this admin's own screen at once.
  const applyChanges = changes => {
    setOverrides(prev => {
      const next = { ...prev };
      for (const [code, entries] of Object.entries(changes)) {
        const map = { ...(next[code] || {}) };
        for (const [key, text] of Object.entries(entries)) { if (text == null) delete map[key]; else map[key] = text; }
        next[code] = map;
        applyTextOverrides(code, map);
      }
      return next;
    });
  };

  const languageName = code => SUPPORTED_LANGUAGES.find(l => l.code === code)?.label || code;

  const save = async (key, value) => {
    if (!(await confirmAdminChange(t, key))) return false;
    try {
      const saved = await adminSaveText(lang, key, value, cascade);
      const translations = saved?.translations || {};
      const changes = { [lang]: { [key]: value } };
      for (const [code, text] of Object.entries(translations)) changes[code] = { [key]: text };
      applyChanges(changes);
      const done = Object.keys(translations).length;
      const skipped = saved?.skipped || [];
      setMsg({
        type: skipped.length ? 'warning' : 'success',
        text: [cascade ? t('admin.texts.saved_translated', { count: done }) : t('admin.texts.saved'),
          skipped.length ? t('admin.texts.translate_skipped', { langs: skipped.map(languageName).join('، ') }) : ''].filter(Boolean).join(' '),
      });
      return true;
    } catch (e) { setMsg({ type: 'error', text: apiError(e) }); return false; }
  };

  const reset = async key => {
    if (!(await confirmAdminChange(t, key, true))) return false;
    try {
      await adminResetText(lang, key, cascade);
      const codes = cascade ? SUPPORTED_LANGUAGES.map(l => l.code) : [lang];
      applyChanges(Object.fromEntries(codes.map(code => [code, { [key]: null }])));
      setMsg({ type: 'success', text: cascade ? t('admin.texts.reset_all_done') : t('admin.texts.reset_done') });
      return true;
    } catch (e) { setMsg({ type: 'error', text: apiError(e) }); return false; }
  };

  const editedCount = Object.keys(langOverrides).length;

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t('admin.texts.title')} subtitle={t('admin.texts.subtitle')} />

      {msg && (
        <div role="status" className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : msg.type === 'warning' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      <div className="bg-surface rounded-card border border-border p-3 flex flex-wrap items-center gap-2">
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('admin.texts.search')} className="input py-1.5 text-[13px] flex-1 min-w-[200px]" data-testid="texts-search" />
        <label className="flex items-center gap-1.5 text-[13px] text-fg">
          <input type="checkbox" checked={editedOnly} onChange={e => setEditedOnly(e.target.checked)} />
          {t('admin.texts.edited_only')} ({editedCount})
        </label>
        <p className="basis-full m-0 text-[12px] text-fg-muted" data-testid="texts-translate-all">🌐 {t('admin.texts.arabic_only_hint')}</p>
      </div>

      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[52px] rounded-card bg-surface border border-border animate-pulse" />)}
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🔤" title={t('admin.texts.no_results')} /></div>
      ) : (
        <>
          <div className="text-[12.5px] text-fg-muted">{t('admin.texts.count', { shown: Math.min(limit, matches.length), total: matches.length })}</div>
          <div className="bg-surface rounded-card border border-border divide-y divide-border overflow-hidden">
            {matches.slice(0, limit).map(([key, original]) => (
              <TextRow key={`${lang}:${key}`} lang={lang} textKey={key} original={original}
                edited={langOverrides[key]} onSave={save} onReset={reset} />
            ))}
          </div>
          {matches.length > limit && (
            <div className="text-center">
              <AdminButton variant="secondary" onClick={() => setLimit(limit + PAGE)}>{t('admin.texts.show_more')}</AdminButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TextRow({ lang, textKey, original, edited, onSave, onReset }) {
  const { t } = useTranslation();
  const current = edited ?? original;
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValue(current); }, [current]);

  const changed = value !== current;
  const empty = !value.trim();
  const partsOk = samePlaceholders(original, value);
  const dir = getLanguageDir(lang);

  const run = async action => {
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
  };

  // Compact rows (AYK-220): the key and state on one small line, the text and its buttons together.
  return (
    <div className={`px-3 py-2 ${edited !== undefined ? 'bg-amber-50/60' : ''}`} data-testid="text-row">
      <div className="flex items-center gap-2 text-[10.5px] leading-tight mb-1">
        <code dir="ltr" className="text-fg-subtle break-all">{textKey}</code>
        {edited !== undefined && <span className="shrink-0 px-1.5 rounded-pill bg-amber-100 text-amber-800 font-bold">{t('admin.texts.edited')}</span>}
        {edited !== undefined && <span dir={dir} className="text-fg-muted truncate" title={original}>· {t('admin.texts.original')}: {original}</span>}
      </div>
      <div className="flex items-start gap-1.5 flex-wrap sm:flex-nowrap">
        <textarea dir={dir} value={value} onChange={e => setValue(e.target.value)} maxLength={5000}
          rows={Math.min(4, Math.max(1, Math.ceil(value.length / 45)))} className="input flex-1 min-w-0 text-[13.5px] leading-snug"
          style={{ minHeight: 0, height: 'auto', padding: '6px 10px', resize: 'vertical' }} />
        <div className="flex gap-1 shrink-0">
          <AdminButton size="sm" loading={busy} disabled={!changed || empty || !partsOk || busy}
            onClick={() => run(() => onSave(textKey, value))}>{t('admin.texts.save')}</AdminButton>
          {changed && <AdminButton size="sm" variant="ghost" disabled={busy} onClick={() => setValue(current)}>{t('admin.texts.undo')}</AdminButton>}
          {edited !== undefined && !changed && (
            <AdminButton size="sm" variant="warning" disabled={busy} onClick={() => run(() => onReset(textKey))}>{t('admin.texts.reset')}</AdminButton>
          )}
        </div>
      </div>
      {!partsOk && <p className="text-[11.5px] text-rose-700 mt-1 mb-0">{t('admin.texts.placeholders', { parts: textPlaceholders(original).join(' ') })}</p>}
      {empty && <p className="text-[11.5px] text-rose-700 mt-1 mb-0">{t('admin.texts.empty_value')}</p>}
    </div>
  );
}
