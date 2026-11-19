import { useTranslation } from 'react-i18next';
import { whatsappLink } from '../../utils/whatsapp';

// The numbers a provider chose to show (AYK-314): a call link and a WhatsApp link. Nothing when
// the provider keeps them hidden, so the page looks as before.
export default function ProviderNumbers({ phone, whatsapp, className = '' }) {
  const { t } = useTranslation();
  const chat = whatsappLink(whatsapp);
  if (!phone && !chat) return null;
  const pill = 'inline-flex items-center gap-1 px-3 py-1.5 rounded-pill text-[12.5px] bg-surface-alt border border-border';
  return (
    <div className={`flex flex-wrap gap-2 ${className}`} data-testid="provider-numbers">
      {phone && (
        <a href={`tel:${phone}`} className={pill} aria-label={`${t('provider_contact.call')} ${phone}`}>
          📞 {t('provider_contact.call')} <bdi dir="ltr">{phone}</bdi>
        </a>
      )}
      {chat && (
        <a href={chat} target="_blank" rel="noopener noreferrer" className={pill}
          aria-label={`${t('provider_contact.whatsapp_button')} ${whatsapp}`}>
          💬 {t('provider_contact.whatsapp_button')} <bdi dir="ltr">{whatsapp}</bdi>
        </a>
      )}
    </div>
  );
}
