import { useTranslation } from 'react-i18next';

const STYLES = {
  new:         'bg-brand-50 text-brand-700',
  reviewing:   'bg-amber-50 text-amber-700',
  accepted:    'bg-indigo-50 text-indigo-700',
  in_progress: 'bg-sand-100 text-sand-700',
  completed:   'bg-emerald-50 text-emerald-700',
  cancelled:   'bg-rose-50 text-rose-700',
};

export default function OrderStatusBadge({ status }) {
  const { t } = useTranslation();
  const cls = STYLES[status] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-pill text-[11px] font-bold ${cls}`}>
      {t(`catalog.status_${status}`)}
    </span>
  );
}
