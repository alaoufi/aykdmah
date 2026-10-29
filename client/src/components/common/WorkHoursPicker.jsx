import { useTranslation } from 'react-i18next';

// Working hours as two drop-downs in half-hour steps, plus "24 hours" (no hours
// stored). Phones' native time pickers could not be edited with some keyboards.
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

export default function WorkHoursPicker({ from, to, onChange }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const allDay = !from && !to;
  const label = value => {
    const [h, m] = value.split(':').map(Number);
    try { return new Date(2000, 0, 1, h, m).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }); } catch (_) { return value; }
  };
  const options = value => (value && !SLOTS.includes(value) ? [value, ...SLOTS] : SLOTS);
  const select = (key, value) => (
    <label className="text-[12px] text-fg-muted">{t(`availability.${key}`)}
      <select className="select mt-0.5" value={value} data-testid={`work-${key}`}
        onChange={e => onChange(key === 'from' ? { work_from: e.target.value, work_to: to } : { work_from: from, work_to: e.target.value })}>
        {options(value).map(slot => <option key={slot} value={slot}>{label(slot)}</option>)}
      </select></label>
  );
  return (
    <div className="space-y-2" data-testid="work-hours">
      <label className="flex items-center gap-2 text-[13.5px] font-semibold cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-primary" checked={allDay} data-testid="work-24h"
          onChange={e => onChange(e.target.checked ? { work_from: '', work_to: '' } : { work_from: '08:00', work_to: '17:00' })} />
        🕐 {t('availability.hours_24')}
      </label>
      {!allDay && <div className="grid grid-cols-2 gap-2">{select('from', from)}{select('to', to)}</div>}
    </div>
  );
}
