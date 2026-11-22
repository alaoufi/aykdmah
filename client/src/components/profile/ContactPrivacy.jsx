import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { updateProfile } from '../../services/authService';
import { apiError } from '../../services/api';
import Input from '../common/Input';
import Button from '../common/Button';

// AYK-418 (the owner): a requester chooses whether the providers of their requests' professions
// see their phone and WhatsApp (then «تواصل» on the request offers them besides the chat), and
// whether the site may contact them about what is new. All off until turned on; saved at once.
export default function ContactPrivacy() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp_number || '');
  useEffect(() => { setWhatsapp(user?.whatsapp_number || ''); }, [user?.whatsapp_number]);
  if (!user || user.role === 'admin') return null;
  const requester = user.role === 'client' || Number(user.also_client) === 1;
  const on = key => Number(user[key]) === 1;
  const level = key => (Number(user[key]) ? 1 : 0);
  const save = async (key, payload) => {
    setBusy(key); setProblem('');
    try { await updateProfile(payload); await refresh(); } catch (err) { setProblem(apiError(err)); } finally { setBusy(''); }
  };
  const Toggle = ({ name, label, hint, disabled }) => (
    <label className={`flex items-start gap-2.5 py-1.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5 w-4 h-4 shrink-0" checked={on(name)} disabled={disabled || busy === name}
        onChange={event => save(name, { [name]: event.target.checked ? 1 : 0 })} data-testid={`contact-${name}`} />
      <span className="min-w-0">
        <span className="block font-semibold text-[13px]">{label}</span>
        <span className="block text-[11.5px] text-fg-muted">{hint}</span>
      </span>
    </label>
  );
  // AYK-438/439: name, phone and WhatsApp each hidden or shown to service providers.
  // AYK-455 (the owner: «شكلها ليس جميلًا… احذف الاسم والواتس والجوال إذا لم يكن مسجّلًا في ملفه، وأسمح
  // بمشاركة طلباتي تُحذف، وتُرتّب بخط صغير وترتيب منسّق»): one short row each, only for what he has.
  const LEVELS = [[0, t('contact_privacy.level_hidden')], [1, t('contact_privacy.level_providers')]];
  const Level = ({ name, label }) => (
    <div className="flex items-center justify-between gap-2 py-1.5 border-t border-border first:border-t-0" data-testid={`contact-${name}`}>
      <span className="text-[13px] font-semibold text-fg min-w-0 truncate">{label}</span>
      <div className="inline-flex shrink-0 rounded-pill bg-surface-alt p-0.5" role="radiogroup" aria-label={label}>
        {LEVELS.map(([value, text]) => {
          const active = level(name) === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={active} disabled={busy === name}
              onClick={() => !active && save(name, { [name]: value })} data-testid={`contact-${name}-${value}`}
              className={`px-2.5 py-1 rounded-pill border-0 text-[11.5px] font-bold cursor-pointer ${active ? 'bg-primary text-primary-fg' : 'bg-transparent text-fg-muted'}`}
              style={{ minHeight: 0 }}>{text}</button>
          );
        })}
      </div>
    </div>
  );
  const hasName = Boolean(String(user.full_name || '').trim());
  const hasPhone = Boolean(user.phone);
  const hasWhatsApp = hasPhone || Boolean(user.whatsapp_number);
  return (
    <div className="card mb-4" id="contact-privacy" data-testid="contact-privacy">
      <h3 className="mb-0.5 text-[15px]">📇 {t('contact_privacy.title')}</h3>
      <p className="text-[11.5px] text-fg-muted mb-1.5">{t('contact_privacy.hint')}</p>
      {requester && (hasName || hasPhone || hasWhatsApp) && <>
        <div className="rounded-card border border-border px-2.5">
          {hasName && <Level name="share_name" label={t('contact_privacy.share_name')} />}
          {hasPhone && <Level name="share_phone" label={t('contact_privacy.share_phone')} />}
          {hasWhatsApp && <Level name="share_whatsapp" label={t('contact_privacy.share_whatsapp')} />}
        </div>
        {hasWhatsApp && level('share_whatsapp') > 0 && (
          <div className="flex items-end gap-2 mt-2">
            <div className="flex-1 min-w-0">
              <Input id="contact-whatsapp-number" label={t('contact_privacy.whatsapp_number')} type="tel" dir="ltr" maxLength={30}
                placeholder={user.phone || '05XXXXXXXX'} hint={t('contact_privacy.whatsapp_number_hint')}
                value={whatsapp} onChange={event => setWhatsapp(event.target.value)} />
            </div>
            <Button type="button" variant="outline" size="sm" className="mb-4" loading={busy === 'whatsapp_number'}
              disabled={(whatsapp || '') === (user.whatsapp_number || '')}
              onClick={() => save('whatsapp_number', { whatsapp_number: whatsapp.trim() || null })}>{t('common.save')}</Button>
          </div>
        )}
        <p className="text-[11px] text-fg-muted mt-1.5 mb-1">{t('contact_privacy.levels_hint')}</p>
      </>}
      <Toggle name="marketing_opt_in" label={t('contact_privacy.marketing')} hint={t('contact_privacy.marketing_hint')} />
      {problem && <p role="alert" className="form-error mt-1">{problem}</p>}
    </div>
  );
}
