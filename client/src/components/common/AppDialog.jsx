import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { invalidateContactIntents } from '../../utils/contactIntent';
import { TOKEN_CHANGE_EVENT, TOKEN_KEY, ADMIN_TOKEN_KEY } from '../../services/api';
import { useTranslation } from 'react-i18next';

// The app's own dialogs (AYK-155), in place of the browser's bare alert / confirm / prompt boxes
// (which show the site's address and look out of place). Call them from anywhere:
//   await showAlert({ title, message })                          → undefined
//   await askConfirm({ title, message, tone: 'danger' })         → true / false
//   await askText({ title, message, value, required, multiline }) → the text, or null if cancelled
// <AppDialogHost /> is mounted once (App.jsx) and shows them one at a time.
let open = null;
const queue = [];

function show(options) {
  return new Promise((resolve) => {
    if (options.isCurrent && !options.isCurrent()) {resolve(null);return;}
    queue.push({ ...options, resolve });
    open?.();
  });
}
export const showAlert = (options) => show({ kind: 'alert', ...options });
export const askConfirm = (options) => show({ kind: 'confirm', ...options });
export const askChoice = (options) => show({ kind: 'choice', ...options });
export const askText = (options) => show({ kind: 'prompt', ...options });

const ICON = { alert: 'ℹ️', confirm: '❓', prompt: '✍️', choice: '💬', danger: '⚠️', success: '✅' };

export default function AppDialogHost() {
  const { t } = useTranslation();
  const location = useLocation();
  const [current, setCurrent] = useState(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const okRef = useRef(null);

  useEffect(() => {
    open = () => setCurrent(c => {
      if (c && (!c.isCurrent || c.isCurrent())) return c;
      if (c) c.resolve(null);
      while (queue.length) {
        const next=queue.shift();
        if (!next.isCurrent || next.isCurrent()) return next;
        next.resolve(null);
      }
      return null;
    });
    open();
    return () => { open = null; };
  }, []);

  useLayoutEffect(() => {
    const invalidate = event => {
      if (event?.type === 'storage' && event.key !== null && ![TOKEN_KEY,ADMIN_TOKEN_KEY].includes(event.key)) return;
      invalidateContactIntents();open?.();
    };
    invalidate();
    window.addEventListener(TOKEN_CHANGE_EVENT,invalidate);
    window.addEventListener('storage',invalidate);
    return () => {
      invalidateContactIntents();
      window.removeEventListener(TOKEN_CHANGE_EVENT,invalidate);
      window.removeEventListener('storage',invalidate);
    };
  },[location.key,location.pathname,location.search,location.hash]);

  useEffect(() => {
    if (!current) return;
    setValue(current.value ?? '');
    setError('');
    setTimeout(() => (current.kind === 'prompt' ? inputRef.current : okRef.current)?.focus(), 30);
  }, [current]);

  if (!current) return null;
  const { kind, title, message, tone, placeholder, multiline, required, minLength = 0, maxLength = 500, confirmText, cancelText } = current;
  const danger = tone === 'danger';

  const finish = (result) => {
    current.resolve(current.isCurrent && !current.isCurrent() ? null : result);
    setCurrent(queue.shift() || null);
  };
  const confirm = () => {
    if (kind === 'prompt') {
      const text = value.trim();
      if ((required || minLength) && text.length < Math.max(1, minLength)) {
        setError(minLength > 1 ? t('dialog.min_length', { count: minLength }) : t('dialog.required'));
        inputRef.current?.focus();
        return;
      }
      finish(text);
    } else if (kind === 'choice') finish(current.choices?.[0]?.value ?? null);
    else finish(kind === 'confirm' ? true : undefined);
  };
  const cancel = () => finish(kind === 'confirm' ? false : ['prompt','choice'].includes(kind) ? null : undefined);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (kind === 'choice') return;
    if (e.key === 'Enter' && !(multiline && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); confirm(); }
  };

  const Field = multiline ? 'textarea' : 'input';
  return (
    <div className="fixed inset-0 z-[6000] grid place-items-center bg-black/45 backdrop-blur-[2px] px-5" onKeyDown={onKey}
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div role={kind === 'alert' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="app-dialog-title"
        className="w-full max-w-sm rounded-[22px] bg-surface shadow-card p-5 text-start" data-testid="app-dialog">
        <div className="flex items-start gap-3">
          <span className={`shrink-0 grid place-items-center w-11 h-11 rounded-full text-[20px] ${danger ? 'bg-rose-50' : 'bg-brand-50'}`} aria-hidden="true">
            {ICON[danger ? 'danger' : tone === 'success' ? 'success' : kind]}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="app-dialog-title" className="m-0 text-[17px] font-extrabold text-fg leading-snug">{title || t(`dialog.title_${kind === 'choice' ? 'confirm' : kind}`)}</h2>
            {message && <p className="mt-1.5 mb-0 text-[14px] text-fg-muted leading-relaxed whitespace-pre-line">{message}</p>}
          </div>
        </div>
        {kind === 'prompt' && (
          <div className="mt-4">
            <Field ref={inputRef} value={value} rows={multiline ? 3 : undefined} maxLength={maxLength} placeholder={placeholder || ''}
              onChange={(e) => { setValue(e.target.value); setError(''); }} aria-invalid={Boolean(error)}
              className={`w-full px-3.5 py-2.5 rounded-card border outline-none text-[15px] bg-surface text-fg ${
                error ? 'border-2 border-rose-500 bg-rose-50' : 'border-border focus:border-brand-500'
              }`} />
            {error && <p role="alert" className="mt-1.5 mb-0 text-[12.5px] font-bold text-rose-600">⚠️ {error}</p>}
          </div>
        )}
        <div className="mt-5 flex gap-2 flex-wrap">
          {kind === 'choice' ? current.choices.map((choice, index) => <button key={choice.value} ref={index === 0 ? okRef : undefined} type="button" className="btn btn-primary flex-1" onClick={() => finish(choice.value)}>{choice.label}</button>) : <button ref={okRef} type="button" onClick={confirm}
            className={`flex-1 h-11 rounded-pill text-white text-[14.5px] font-bold shadow-soft transition ${danger ? 'bg-rose-600 hover:bg-rose-700' : ''}`}
            style={danger ? undefined : { background: 'linear-gradient(135deg, rgb(var(--color-primary-from)), rgb(var(--color-primary-to)))' }}>
            {confirmText || t(kind === 'alert' ? 'dialog.ok' : kind === 'prompt' ? 'dialog.save' : 'dialog.yes')}
          </button>}
          {kind !== 'alert' && (
            <button type="button" onClick={cancel}
              className="flex-1 h-11 rounded-pill border border-border bg-surface text-fg text-[14.5px] font-bold hover:bg-surface-alt transition">
              {cancelText || t('dialog.cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
