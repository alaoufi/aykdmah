import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import { localizedName } from '../../utils/localize';

// AYK-366 (the owner: «فرق بين متاح وداخل التطبيق… ركّز فيها بعمق»). Two separate things:
//  • متاح / غير متاح: the provider's own word. Not on leave, not stopped, inside their weekly
//    schedule (or 24 hours). A green circle; a red one says why, with a link to the schedule.
//  • متواجد: their app is open now (the live connection). Shown apart, never mixed with the above.
const STYLES = {
  available: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  off: 'bg-rose-50 text-rose-700 border-rose-200',
};

// Weekday names follow the interface language (0 = Sunday).
export function weekdayName(day, lang, format = 'short') {
  return new Intl.DateTimeFormat(lang, { weekday: format, timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + day)));
}

// 'HH:MM' in the reader's way of writing times; '24:00' is midnight.
export function timeLabel(value, lang, t) {
  if (value === '24:00') return t ? t('availability.midnight') : '24:00';
  const [h, m] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h)) return value || '';
  try { return new Date(2000, 0, 1, h, m || 0).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }); } catch (_) { return value; }
}

// The week as seven lists of periods, or null for 24 hours every day. Older answers (without
// `schedule`) are read from their days and one period.
export function weekOf(availability) {
  if (!availability) return null;
  if (Array.isArray(availability.schedule)) return availability.schedule;
  if (availability.schedule === null && availability.all_hours) return null;
  const days = availability.work_days;
  const hours = availability.work_from && availability.work_to ? [[availability.work_from, availability.work_to]] : [['00:00', '24:00']];
  if (!days && !(availability.work_from && availability.work_to)) return null;
  return [0, 1, 2, 3, 4, 5, 6].map(day => (!days || days.includes(day) ? hours : []));
}

const periodsText = (periods, lang, t) => periods.map(([from, to]) => (from === '00:00' && to === '24:00'
  ? t('availability.hours_24') : `${timeLabel(from, lang, t)} – ${timeLabel(to, lang, t)}`)).join('، ');

export function workingSummary(availability, t, lang) {
  const week = weekOf(availability);
  if (!week) return t('availability.all_hours');
  return [0, 1, 2, 3, 4, 5, 6].filter(day => week[day]?.length)
    .map(day => `${weekdayName(day, lang)} ${periodsText(week[day], lang, t)}`).join(' · ');
}

export const isAvailable = availability => availability?.state === 'available';
// Kept for older callers: «green» now means available by the provider's own schedule.
export const isPresent = isAvailable;

function reasonOf(availability, t) {
  const state = availability.state;
  if (state === 'vacation' && availability.until) return t('availability.vacation_until', { date: availability.until });
  return t(`availability.state.${state}`, t('for_you.unavailable'));
}

// The whole week, one line a day (the link «جدول العمل» opens it).
export function WeekSchedule({ availability }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const week = weekOf(availability);
  return (
    <div className="space-y-2" data-testid="week-schedule">
      {availability?.state === 'paused' && <p className="m-0 text-[13px] font-semibold text-danger">⛔ {t('availability.state.paused')}</p>}
      {availability?.state === 'vacation' && <p className="m-0 text-[13px] font-semibold text-danger">🏖️ {reasonOf(availability, t)}</p>}
      {!week ? <p className="m-0 text-[14px] font-semibold">🕐 {t('availability.all_hours')}</p> : (
        <ul className="list-none p-0 m-0 divide-y divide-border">
          {[0, 1, 2, 3, 4, 5, 6].map(day => (
            <li key={day} className="flex items-start justify-between gap-3 py-1.5 text-[13.5px]">
              <span className="font-semibold">{weekdayName(day, lang, 'long')}</span>
              <span className={week[day]?.length ? 'text-fg' : 'text-fg-muted'}>{week[day]?.length ? periodsText(week[day], lang, t) : t('availability.day_off')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// 🟢 «متاح الآن», or 🔴 why not, with «جدول العمل» next to the red one.
export default function AvailabilityBadge({ availability, className = '', name = '' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (!availability?.state) return null;
  const available = isAvailable(availability);
  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`} data-availability={availability.state}>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-pill border text-[11.5px] font-semibold ${available ? STYLES.available : STYLES.off}`}>
        <span aria-hidden="true">{available ? '🟢' : '🔴'}</span>{available ? t('availability.state.available') : reasonOf(availability, t)}
      </span>
      {!available && (
        <button type="button" className="text-[11.5px] font-semibold text-primary underline bg-transparent border-0 p-0 cursor-pointer"
          onClick={event => { event.preventDefault(); event.stopPropagation(); setOpen(true); }} data-testid="schedule-link">
          🗓️ {t('availability.schedule_link')}
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={`🗓️ ${t('availability.schedule_title')}${name ? ` — ${name}` : ''}`}>
        <WeekSchedule availability={availability} />
      </Modal>
    </span>
  );
}

// 📱 «متواجد الآن» (app open now) — separate from being available. Nothing when unknown.
export function PresenceTag({ present, className = '' }) {
  const { t } = useTranslation();
  if (present === undefined || present === null) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[11.5px] font-semibold ${present ? 'text-success' : 'text-fg-muted'} ${className}`}
      title={t('availability.present_hint')} data-presence={present ? 'present' : 'absent'}>
      📱 {t(present ? 'availability.present' : 'availability.not_present')}
    </span>
  );
}

// 🗺️ «يغطي: المجمعة — كل الأحياء» or the districts they chose.
export function CoverageLine({ coverage, className = '' }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  if (!coverage?.city) return null;
  const city = localizedName({ name_ar: coverage.city.ar, name_en: coverage.city.en, name_translations: coverage.city.tr }, lang);
  const names = (coverage.districts || []).map(d => localizedName({ name_ar: d.ar, name_en: d.en }, lang)).filter(Boolean);
  const extra = Math.max(0, (coverage.districts_count || 0) - names.length);
  const where = coverage.districts_count ? `${names.join('، ')}${extra ? ` ${t('coverage.more_districts', { count: extra })}` : ''}` : t('coverage.all_districts');
  return (
    <span className={`text-[12px] text-fg-muted ${className}`} data-testid="coverage-line">
      🗺️ {t('coverage.covers', { city })} — {where}
    </span>
  );
}

// The three together, as on every provider card.
export function ProviderStatus({ availability, coverage, name = '', className = '' }) {
  return (
    <span className={`flex flex-col gap-1 ${className}`}>
      <span className="flex items-center gap-2 flex-wrap">
        <AvailabilityBadge availability={availability} name={name} />
        <PresenceTag present={availability?.present} />
      </span>
      <CoverageLine coverage={coverage} />
    </span>
  );
}
