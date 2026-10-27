import { useTranslation } from 'react-i18next';

const STYLES = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  off_hours: 'bg-amber-50 text-amber-700 border-amber-200',
  off_day: 'bg-amber-50 text-amber-700 border-amber-200',
  vacation: 'bg-sky-50 text-sky-700 border-sky-200',
  paused: 'bg-surface-alt text-fg-muted border-border',
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

export default function AvailabilityBadge({ availability, className = '' }) {
  const { t } = useTranslation();
  if (!availability?.state) return null;
  const { state } = availability;
  const label = state === 'vacation' && availability.until
    ? t('availability.vacation_until', { date: availability.until })
    : state === 'off_hours' && availability.work_from
      ? t('availability.off_hours_range', { from: availability.work_from, to: availability.work_to })
      : t(`availability.state.${state}`);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[11.5px] font-semibold ${STYLES[state] || STYLES.paused} ${className}`}
      data-availability={state}>
      <span aria-hidden="true">{state === 'available' ? '🟢' : state === 'vacation' ? '🏖️' : state === 'paused' ? '⏸️' : '🕒'}</span>{label}
    </span>
  );
}
