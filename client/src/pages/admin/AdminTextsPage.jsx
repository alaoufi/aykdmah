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
  const { t, i18n } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const startLang = SUPPORTED_LANGUAGES.some(l => l.code === i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'ar';
  const [lang, setLang] = useState(startLang);
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

  const setLangOverrides = (code, next) => {
    setOverrides(prev => ({ ...prev, [code]: next }));
    applyTextOverrides(code, next); // this admin sees the change at once
  };

  const save = async (key, value) => {
    if (!(await confirmAdminChange(t, key))) return false;
    try {
      await adminSaveText(lang, key, value);
      setLangOverrides(lang, { ...langOverrides, [key]: value });
      setMsg({ type: 'success', text: t('admin.texts.saved') });
      return true;
    } catch (e) { setMsg({ type: 'error', text: apiError(e) }); return false; }
  };

  const reset = async key => {
    if (!(await confirmAdminChange(t, key, true))) return false;
    try {
      await adminResetText(lang, key);
      const next = { ...langOverrides };
      delete next[key];
      setLangOverrides(lang, next);
      setMsg({ type: 'success', text: t('admin.texts.reset_done') });
      return true;
    } catch (e) { setMsg({ type: 'error', text: apiError(e) }); return false; }
  };

  const editedCount = Object.keys(langOverrides).length;

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t('admin.texts.title')} subtitle={t('admin.texts.subtitle')} />

      {msg && (
        <div role="status" className={`px-4 py-3 rounded-card text-[13.5px] font-semibold ${
          msg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'
        }`}>{msg.text}</div>
      )}

      <div className="bg-surface rounded-card border border-border p-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] font-bold text-fg">
          {t('admin.texts.language')}
          <select value={lang} onChange={e => setLang(e.target.value)} className="input py-1.5 text-[13px] w-auto" data-testid="texts-language">
            {SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('admin.texts.search')} className="input py-1.5 text-[13px] flex-1 min-w-[200px]" data-testid="texts-search" />
        <label className="flex items-center gap-1.5 text-[13px] text-fg">
          <input type="checkbox" checked={editedOnly} onChange={e => setEditedOnly(e.target.checked)} />
          {t('admin.texts.edited_only')} ({editedCount})
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[110px] rounded-card bg-surface border border-border animate-pulse" />)}
        </div>
      ) : matches.length === 0 ? (
        <div className="bg-surface rounded-card border border-border"><EmptyState icon="🔤" title={t('admin.texts.no_results')} /></div>
      ) : (
        <>
          <div className="text-[12.5px] text-fg-muted">{t('admin.texts.count', { shown: Math.min(limit, matches.length), total: matches.length })}</div>
          <div className="space-y-2">
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

  return (
    <div className={`bg-surface rounded-card border-2 p-3 ${edited !== undefined ? 'border-amber-300' : 'border-border'}`} data-testid="text-row">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <code dir="ltr" className="text-[11px] text-fg-subtle break-all">{textKey}</code>
        {edited !== undefined && <span className="shrink-0 px-2 py-0.5 rounded-pill bg-amber-50 text-amber-700 text-[11px] font-bold">{t('admin.texts.edited')}</span>}
      </div>
      {edited !== undefined && (
        <p dir={dir} className="text-[12.5px] text-fg-muted mb-1.5"><b>{t('admin.texts.original')}:</b> {original}</p>
      )}
      <textarea dir={dir} value={value} onChange={e => setValue(e.target.value)} maxLength={5000}
        rows={Math.min(6, Math.max(1, Math.ceil(value.length / 70)))} className="input w-full text-[14px]" />
      {!partsOk && (
        <p className="text-[12px] text-rose-700 mt-1">{t('admin.texts.placeholders', { parts: textPlaceholders(original).join(' ') })}</p>
      )}
      {empty && <p className="text-[12px] text-rose-700 mt-1">{t('admin.texts.empty_value')}</p>}
      <div className="flex gap-1.5 mt-2">
        <AdminButton size="sm" loading={busy} disabled={!changed || empty || !partsOk || busy}
          onClick={() => run(() => onSave(textKey, value))}>{t('admin.texts.save')}</AdminButton>
        {edited !== undefined && (
          <AdminButton size="sm" variant="warning" disabled={busy} onClick={() => run(() => onReset(textKey))}>{t('admin.texts.reset')}</AdminButton>
        )}
        {changed && (
          <AdminButton size="sm" variant="ghost" disabled={busy} onClick={() => setValue(current)}>{t('admin.texts.undo')}</AdminButton>
        )}
      </div>
    </div>
  );
}
