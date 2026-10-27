import { useTranslation } from 'react-i18next';
import { IconPin } from './Icons';

const SERVICE_MODES = ['mobile', 'fixed', 'both'];

export default function ProviderServiceModeBadge({ mode, className = '' }) {
  const { t } = useTranslation();

  if (!SERVICE_MODES.includes(mode)) return null;

  return (
    <span
      data-provider-service-mode={mode}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-pill border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold leading-snug text-brand-700 ${className}`}
    >
      <span aria-hidden="true" className="shrink-0"><IconPin size={14} /></span>
      <span>{t(`provider.public_mode_${mode}`)}</span>
    </span>
  );
}
