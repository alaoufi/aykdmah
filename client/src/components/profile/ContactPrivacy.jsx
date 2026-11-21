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
  const save = async (key, payload) => {
    setBusy(key); setProblem('');
    try { await updateProfile(payload); await refresh(); } catch (err) { setProblem(apiError(err)); } finally { setBusy(''); }
  };
  const Toggle = ({ name, label, hint, disabled }) => (
    <label className={`flex items-start gap-3 py-2 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-1 w-5 h-5 shrink-0" checked={on(name)} disabled={disabled || busy === name}
        onChange={event => save(name, { [name]: event.target.checked ? 1 : 0 })} data-testid={`contact-${name}`} />
      <span className="min-w-0">
        <span className="block font-semibold text-[14px]">{label}</span>
        <span className="block text-[12px] text-fg-muted">{hint}</span>
      </span>
    </label>
  );
  return (
    <div className="card mb-4" id="contact-privacy" data-testid="contact-privacy">
      <h3 className="mb-1">📇 {t('contact_privacy.title')}</h3>
      <p className="text-[12.5px] text-fg-muted mb-2">{t('contact_privacy.hint')}</p>
      {requester && <>
        <Toggle name="share_phone" label={t('contact_privacy.share_phone')} disabled={!user.phone}
          hint={user.phone ? t('contact_privacy.share_phone_hint') : t('contact_privacy.no_phone')} />
        <Toggle name="share_whatsapp" label={t('contact_privacy.share_whatsapp')} disabled={!user.phone && !whatsapp}
          hint={t('contact_privacy.share_whatsapp_hint')} />
        {on('share_whatsapp') && (
          <div className="flex items-end gap-2 ps-8">
            <div className="flex-1 min-w-0">
              <Input id="contact-whatsapp-number" label={t('contact_privacy.whatsapp_number')} type="tel" dir="ltr" maxLength={30}
                placeholder={user.phone || '05XXXXXXXX'} hint={t('contact_privacy.whatsapp_number_hint')}
                value={whatsapp} onChange={event => setWhatsapp(event.target.value)} />
            </div>
            <Button type="button" variant="outline" className="mb-4" loading={busy === 'whatsapp_number'}
              disabled={(whatsapp || '') === (user.whatsapp_number || '')}
              onClick={() => save('whatsapp_number', { whatsapp_number: whatsapp.trim() || null })}>{t('common.save')}</Button>
          </div>
        )}
      </>}
      <Toggle name="marketing_opt_in" label={t('contact_privacy.marketing')} hint={t('contact_privacy.marketing_hint')} />
      {problem && <p role="alert" className="form-error mt-1">{problem}</p>}
    </div>
  );
}
