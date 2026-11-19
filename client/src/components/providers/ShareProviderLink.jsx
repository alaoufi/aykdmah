import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { listDirectoryIds, saveToDirectory } from '../../services/requestService';
import { apiError } from '../../services/api';

// The public link of a provider's page (AYK-312): /providers/<id>, the same address the
// map and the search lists open. Shared as-is, so it works in any app and browser.
export const providerLink = id => `${window.location.origin}/providers/${encodeURIComponent(id)}`;

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    // Older WebViews: copy through a hidden text field.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
    area.remove();
    return ok;
  }
}

// «أضف إلى دليلي» on its own (AYK-320), for the provider page's action row.
export function DirectoryButton({ providerId, name, onNote }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user || Number(user.id) === Number(providerId)) return undefined;
    let alive = true;
    listDirectoryIds().then(ids => { if (alive) setSaved(ids.map(Number).includes(Number(providerId))); }).catch(() => {});
    return () => { alive = false; };
  }, [user, providerId]);
  if (user && Number(user.id) === Number(providerId)) return null;
  const toggle = async () => {
    if (!user) { navigate('/login', { state: { from: location.pathname } }); return; }
    setBusy(true);
    try {
      await saveToDirectory(providerId, !saved);
      setSaved(!saved);
      onNote?.(!saved ? t('directory.saved_note', { name }) : '');
    } catch (err) { onNote?.(apiError(err)); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} data-testid="directory-toggle"
      className="px-3 py-2 rounded-pill text-[13px] bg-surface-alt border border-border font-bold">
      📇 {saved ? t('requester.in_directory') : t('requester.add_directory')}
    </button>
  );
}

// mine: the provider looking at their own link (dashboard), so no «add to my directory».
// bare (AYK-320): only the link and its buttons, inside the provider page's «مشاركة» menu.
export default function ShareProviderLink({ providerId, name, mine = false, bare = false }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const url = providerLink(providerId);
  const self = mine || bare || Number(user?.id) === Number(providerId);
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || self) return undefined;
    let alive = true;
    listDirectoryIds().then(ids => { if (alive) setSaved(ids.map(Number).includes(Number(providerId))); }).catch(() => {});
    return () => { alive = false; };
  }, [user, self, providerId]);

  const text = t('share_provider.message', { name });
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: name, text, url }); return; } catch (err) {
        if (err?.name === 'AbortError') return; // the person closed the share sheet
      }
    }
    setNote(await copyText(url) ? t('share_provider.copied') : url);
  };
  const copy = async () => setNote(await copyText(url) ? t('share_provider.copied') : url);

  const toggleSaved = async () => {
    if (!user) { navigate('/login', { state: { from: location.pathname } }); return; }
    setBusy(true);
    try {
      await saveToDirectory(providerId, !saved);
      setSaved(!saved);
      setNote(!saved ? t('directory.saved_note', { name }) : '');
    } catch (err) {
      setNote(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={bare ? 'space-y-2' : 'card p-4 space-y-2'} data-testid="share-provider">
      {!bare && <h2 className="font-bold text-fg">{mine ? t('share_provider.my_title') : t('share_provider.title')}</h2>}
      {mine && <p className="text-[12.5px] text-fg-muted">{t('share_provider.my_hint')}</p>}
      <div dir="ltr" className="text-[12.5px] text-fg bg-surface-alt border border-border rounded-card px-3 py-2 break-all select-all"
        data-testid="share-provider-url">{url}</div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={share}
          className="btn btn-primary btn-sm">🔗 {t('share_provider.share')}</button>
        <button type="button" onClick={copy}
          className="px-3 py-1.5 rounded-pill text-[12.5px] bg-surface-alt border border-border">📋 {t('share_provider.copy')}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`} target="_blank" rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-pill text-[12.5px] bg-surface-alt border border-border">💬 {t('share_provider.whatsapp')}</a>
        {!self && (
          <button type="button" onClick={toggleSaved} disabled={busy} aria-pressed={saved}
            className="px-3 py-1.5 rounded-pill text-[12.5px] bg-surface-alt border border-border font-bold">
            📇 {saved ? t('requester.in_directory') : t('requester.add_directory')}
          </button>
        )}
        {mine && (
          <a href={url} className="px-3 py-1.5 rounded-pill text-[12.5px] bg-surface-alt border border-border">👁️ {t('share_provider.view')}</a>
        )}
      </div>
      {note && <p role="status" className="text-[12.5px] text-fg-muted">{note}</p>}
    </div>
  );
}
