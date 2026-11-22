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
  const level = key => Math.max(0, Math.min(2, Number(user[key]) || 0));
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
  // AYK-438 (the owner: «لطالب الخدمة خيار: الاسم، الجوال، الواتس؛ ظهوره لمقدمي الخدمة أو في لوحة العرض»):
  // each one hidden, shown to service providers, or shown to everyone on the request's panel.
  const LEVELS = [[0, t('contact_privacy.level_hidden')], [1, t('contact_privacy.level_providers')], [2, t('contact_privacy.level_everyone')]];
  const Level = ({ name, label, disabled }) => (
    <div className={`py-2 ${disabled ? 'opacity-50' : ''}`} data-testid={`contact-${name}`}>
      <div className="font-semibold text-[14px] mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {LEVELS.map(([value, text]) => {
          const active = level(name) === value;
          return (
            <button key={value} type="button" role="radio" aria-checked={active} disabled={disabled || busy === name}
              onClick={() => !active && save(name, { [name]: value })} data-testid={`contact-${name}-${value}`}
              className={`px-3 py-1.5 rounded-pill border text-[12.5px] font-bold ${active ? 'bg-primary text-primary-fg border-primary' : 'bg-surface border-border text-fg'}`}
              style={{ minHeight: 0 }}>{text}</button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="card mb-4" id="contact-privacy" data-testid="contact-privacy">
      <h3 className="mb-1">📇 {t('contact_privacy.title')}</h3>
      <p className="text-[12.5px] text-fg-muted mb-2">{t('contact_privacy.hint')}</p>
      {requester && <>
        <Level name="share_name" label={t('contact_privacy.share_name')} />
        <Level name="share_phone" label={t('contact_privacy.share_phone')} disabled={!user.phone} />
        {!user.phone && <p className="text-[12px] text-fg-muted m-0">{t('contact_privacy.no_phone')}</p>}
        <Level name="share_whatsapp" label={t('contact_privacy.share_whatsapp')} disabled={!user.phone && !whatsapp} />
        {level('share_whatsapp') > 0 && (
          <div className="flex items-end gap-2">
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
        <p className="text-[12px] text-fg-muted mt-1 mb-2">{t('contact_privacy.levels_hint')}</p>
      </>}
      <Toggle name="marketing_opt_in" label={t('contact_privacy.marketing')} hint={t('contact_privacy.marketing_hint')} />
      {problem && <p role="alert" className="form-error mt-1">{problem}</p>}
    </div>
  );
}
