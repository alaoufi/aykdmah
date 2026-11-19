import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listDirectoryContacts, saveDirectoryContact, removeDirectoryContact } from '../../services/requestService';
import { apiError } from '../../services/api';
import { whatsappLink } from '../../utils/whatsapp';
import { telLink } from '../../utils/phoneLink';

const EMPTY = { name: '', phone: '', whatsapp: '', notes: '' };

// Numbers the person types into "My directory" themselves (AYK-261): a name, a mobile number,
// optionally another WhatsApp number, and notes. Their own notes: nobody else sees them, and they
// stay whatever happens to that person's account. Calling and WhatsApp open the phone's own apps.
export default function DirectoryContacts({ compact = false }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(null); // null = closed; { id?, ...fields } = open
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  useEffect(() => { listDirectoryContacts().then(setRows).catch(() => setRows([])); }, []);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));

  const save = async event => {
    event.preventDefault();
    if (!form.name.trim() || !telLink(form.phone) || (form.whatsapp.trim() && !telLink(form.whatsapp))) { setProblem(t('directory.number_invalid')); return; }
    setBusy(true); setProblem('');
    try {
      const saved = await saveDirectoryContact(form);
      setRows(current => (form.id ? current.map(row => (row.id === saved.id ? saved : row)) : [saved, ...current]));
      setForm(null);
    } catch (err) { setProblem(apiError(err)); } finally { setBusy(false); }
  };
  const remove = async row => {
    setBusy(true); setProblem('');
    try { await removeDirectoryContact(row.id); setRows(current => current.filter(item => item.id !== row.id)); }
    catch (err) { setProblem(apiError(err)); } finally { setBusy(false); }
  };

  if (rows === null) return null;
  const shown = compact ? rows.slice(0, 4) : rows;
  return (
    <div className="mt-5" data-testid="directory-contacts">
      <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
        <div>
          <h3 className="text-[16px] font-extrabold text-fg m-0">📱 {t('directory.numbers_title')}</h3>
          <p className="text-[12.5px] text-fg-muted mt-1 mb-0">{t('directory.numbers_private')}</p>
        </div>
        {!form && <button type="button" className="btn btn-outline btn-sm" onClick={() => { setProblem(''); setForm(EMPTY); }} data-testid="directory-add-number">{t('directory.add_number')}</button>}
      </div>
      {form && (
        <form className="card p-3 grid gap-2 mb-3" onSubmit={save} data-testid="directory-number-form">
          <label className="form-label m-0">{t('directory.contact_name')}
            <input className="input mt-0.5" value={form.name} onChange={set('name')} maxLength={80} required autoFocus data-testid="directory-number-name" />
          </label>
          <label className="form-label m-0">{t('directory.contact_phone')}
            <input className="input mt-0.5" type="tel" inputMode="tel" dir="ltr" value={form.phone} onChange={set('phone')} maxLength={20} required placeholder="05xxxxxxxx" data-testid="directory-number-phone" />
          </label>
          <label className="form-label m-0">{t('directory.contact_whatsapp')}
            <input className="input mt-0.5" type="tel" inputMode="tel" dir="ltr" value={form.whatsapp} onChange={set('whatsapp')} maxLength={20} data-testid="directory-number-whatsapp" />
          </label>
          <label className="form-label m-0">{t('directory.contact_notes')}
            <textarea className="textarea mt-0.5" rows={3} value={form.notes} onChange={set('notes')} maxLength={1000} data-testid="directory-number-notes" />
          </label>
          {problem && <p className="form-error m-0" role="alert">{problem}</p>}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{t('common.save')}</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => { setForm(null); setProblem(''); }}>{t('common.cancel')}</button>
          </div>
        </form>
      )}
      {!form && problem && <p className="form-error" role="alert">{problem}</p>}
      {shown.length > 0 && (
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 list-none p-0 m-0">
          {shown.map(row => (
            <li key={row.id} className="card p-3" data-testid="directory-number">
              <span className="font-bold text-fg block truncate">{row.name}</span>
              <span className="text-[13px] text-fg-muted block"><bdi dir="ltr">{row.phone}</bdi>{row.whatsapp && row.whatsapp !== row.phone ? <> · {t('directory.whatsapp')} <bdi dir="ltr">{row.whatsapp}</bdi></> : null}</span>
              {row.notes && <p className="text-[13px] text-fg mt-1 mb-0 whitespace-pre-wrap break-words" data-testid="directory-number-notes-text">📝 {row.notes}</p>}
              <div className="flex flex-wrap items-center gap-3 mt-2">
                <a className="btn btn-outline btn-sm" href={telLink(row.phone)} data-testid="directory-number-call">📞 {t('directory.call')}</a>
                {whatsappLink(row.whatsapp || row.phone) && <a className="btn btn-primary btn-sm" href={whatsappLink(row.whatsapp || row.phone)} target="_blank" rel="noopener noreferrer" data-testid="directory-number-whatsapp-link">💬 {t('directory.whatsapp')}</a>}
                <button type="button" className="text-[13px] font-semibold text-fg-muted" disabled={busy} onClick={() => { setProblem(''); setForm({ id: row.id, name: row.name, phone: row.phone, whatsapp: row.whatsapp || '', notes: row.notes || '' }); }}>✎ {t('common.edit')}</button>
                <button type="button" className="text-[13px] font-semibold text-fg-muted" disabled={busy} onClick={() => remove(row)}>✕ {t('requester.remove_directory')}</button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
