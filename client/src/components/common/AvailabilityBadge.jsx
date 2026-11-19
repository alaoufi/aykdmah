import { useTranslation } from 'react-i18next';

// AYK-321 (the owner): available is a green circle; any other state is out of service, a red one.
// The words still say why (outside hours, day off, on leave until a date, paused).
const STYLES = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  off: 'bg-rose-50 text-rose-700 border-rose-200',
};

// Weekday names follow the interface language (0 = Sunday).
export function weekdayName(day, lang, format = 'short') {
  return new Intl.DateTimeFormat(lang, { weekday: format, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)));
}

export function workingSummary(availability, t, lang) {
  if (!availability) return '';
  const days = availability.work_days;
  const daysText = days && days.length < 7 ? days.map(day => weekdayName(day, lang)).join('، ') : t('availability.every_day');
  const hours = availability.work_from && availability.work_to
    ? t('availability.hours_range', { from: availability.work_from, to: availability.work_to }) : t('availability.all_day');
  return `${daysText} · ${hours}`;
}

// AYK-325 (the owner): there now = on duty by their hours AND their app connected to the site now.
// An older answer without `present` falls back to the hours alone.
export const isPresent = availability => availability?.state === 'available' && availability.present !== false;

export default function AvailabilityBadge({ availability, className = '' }) {
  const { t } = useTranslation();
  if (!availability?.state) return null;
  const state = availability.state === 'available' && !isPresent(availability) ? 'offline' : availability.state;
  const label = state === 'vacation' && availability.until
    ? t('availability.vacation_until', { date: availability.until })
    : state === 'off_hours' && availability.work_from
      ? t('availability.off_hours_range', { from: availability.work_from, to: availability.work_to })
      : t(`availability.state.${state}`);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[11.5px] font-semibold ${state === 'available' ? STYLES.available : STYLES.off} ${className}`}
      data-availability={state}>
      <span aria-hidden="true">{state === 'available' ? '🟢' : '🔴'}</span>{label}
    </span>
  );
}
