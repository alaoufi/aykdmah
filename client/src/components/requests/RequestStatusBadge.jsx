import { useTranslation } from 'react-i18next';
import { REQUEST_STATUS } from '../../utils/constants';

// AYK-432 (the owner: «مفتوح جنب الاسم… بدل مفتوح تكون متاح بلون أخضر دائم»): beside the request's
// title. An open request reads «متاح» in a fixed green that no theme changes; any other state keeps
// its usual label and colour.
export const AVAILABLE_GREEN = '#059669';

export default function RequestStatusBadge({ status, className = '' }) {
  const { t } = useTranslation();
  if (status === 'open') {
    return (
      <span className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[11.5px] font-bold align-middle ${className}`}
        style={{ background: AVAILABLE_GREEN, color: '#ffffff', lineHeight: 1.5 }} data-testid="request-available">
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 9999, background: '#ffffff', display: 'inline-block' }} />
        {t('request.available')}
      </span>
    );
  }
  const info = REQUEST_STATUS[status] || { color: 'badge' };
  return <span className={`badge ${info.color} shrink-0 ${className}`}>{info.i18nKey ? t(info.i18nKey) : status}</span>;
}
