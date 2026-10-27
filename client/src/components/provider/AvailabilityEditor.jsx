import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { me, updateProviderProfile } from '../../services/authService';
import { apiError } from '../../services/api';
import Button from '../common/Button';
import AvailabilityBadge, { weekdayName } from '../common/AvailabilityBadge';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// Vacation dates, pause/resume, working days and hours (AYK-029).
export default function AvailabilityEditor({ onSaved, onError }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [state, setState] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const data = await me();
    const p = data.provider || {};
    setStatus(p.availability || null);
    setState({
      availability_status: p.availability_status || 'active',
      vacation_from: p.vacation_from || '', vacation_to: p.vacation_to || '',
      work_days: p.work_days ? String(p.work_days).split(',').map(Number) : ALL_DAYS,
      work_from: p.work_from || '', work_to: p.work_to || '',
    });
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const save = async changes => {
    const next = { ...state, ...changes };
    if ((next.vacation_from && !next.vacation_to) || (!next.vacation_from && next.vacation_to)) { onError(t('availability.vacation_both')); return; }
    if ((next.work_from && !next.work_to) || (!next.work_from && next.work_to)) { onError(t('availability.hours_both')); return; }
    if (!next.work_days.length) { onError(t('availability.days_required')); return; }
    setSaving(true); onError(''); onSaved('');
    try {
      await updateProviderProfile({
        availability_status: next.availability_status,
        vacation_from: next.vacation_from || null, vacation_to: next.vacation_to || null,
        work_days: next.work_days, work_from: next.work_from || null, work_to: next.work_to || null,
      });
      await load();
      onSaved(t('availability.saved'));
    } catch (err) { onError(apiError(err)); }
    finally { setSaving(false); }
  };

  if (!state) return null;
  const paused = state.availability_status === 'paused';
  const toggleDay = day => setState(previous => ({ ...previous,
    work_days: previous.work_days.includes(day) ? previous.work_days.filter(value => value !== day) : [...previous.work_days, day].sort() }));

  return (
    <div className="card mb-4 space-y-3" id="availability">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="m-0">🗓️ {t('availability.title')}</h3>
        <AvailabilityBadge availability={status} />
      </div>

      <div className="flex items-center justify-between gap-2 rounded-card border border-border px-3 py-2">
        <span className="text-[13px]">{paused ? t('availability.paused_hint') : t('availability.active_hint')}</span>
        <Button type="button" size="sm" variant={paused ? 'primary' : 'outline'} loading={saving}
          onClick={() => save({ availability_status: paused ? 'active' : 'paused' })}>
          {paused ? `▶️ ${t('availability.resume')}` : `⏸️ ${t('availability.pause')}`}
        </Button>
      </div>

      <form onSubmit={event => { event.preventDefault(); save({}); }} className="space-y-3">
        <fieldset className="border-0 p-0 m-0 min-w-0">
          <legend className="form-label">🏖️ {t('availability.vacation')}</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-fg-muted">{t('availability.from')}
              <input type="date" className="input mt-0.5" value={state.vacation_from} max={state.vacation_to || undefined}
                onChange={e => setState(previous => ({ ...previous, vacation_from: e.target.value }))} /></label>
            <label className="text-[12px] text-fg-muted">{t('availability.to')}
              <input type="date" className="input mt-0.5" value={state.vacation_to} min={state.vacation_from || undefined}
                onChange={e => setState(previous => ({ ...previous, vacation_to: e.target.value }))} /></label>
          </div>
          <p className="text-[11.5px] text-fg-subtle mt-1">{t('availability.vacation_hint')}</p>
          {(state.vacation_from || state.vacation_to) && <button type="button" className="text-[12px] text-primary font-semibold"
            onClick={() => setState(previous => ({ ...previous, vacation_from: '', vacation_to: '' }))}>{t('availability.clear_vacation')}</button>}
        </fieldset>

        <fieldset className="border-0 p-0 m-0 min-w-0">
          <legend className="form-label">{t('availability.work_days')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {ALL_DAYS.map(day => {
              const active = state.work_days.includes(day);
              return <button key={day} type="button" aria-pressed={active} onClick={() => toggleDay(day)}
                className={`px-2.5 py-1 rounded-pill border text-[12.5px] ${active ? 'border-primary bg-primary-soft font-semibold' : 'border-border bg-surface-alt text-fg-muted'}`}>
                {weekdayName(day, lang)}</button>;
            })}
          </div>
        </fieldset>

        <fieldset className="border-0 p-0 m-0 min-w-0">
          <legend className="form-label">{t('availability.work_hours')}</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px] text-fg-muted">{t('availability.from')}
              <input type="time" className="input mt-0.5" value={state.work_from}
                onChange={e => setState(previous => ({ ...previous, work_from: e.target.value }))} /></label>
            <label className="text-[12px] text-fg-muted">{t('availability.to')}
              <input type="time" className="input mt-0.5" value={state.work_to}
                onChange={e => setState(previous => ({ ...previous, work_to: e.target.value }))} /></label>
          </div>
          <p className="text-[11.5px] text-fg-subtle mt-1">{t('availability.hours_hint')}</p>
          {(state.work_from || state.work_to) && <button type="button" className="text-[12px] text-primary font-semibold"
            onClick={() => setState(previous => ({ ...previous, work_from: '', work_to: '' }))}>{t('availability.all_day')}</button>}
        </fieldset>

        <Button type="submit" variant="primary" block loading={saving}>{t('availability.save')}</Button>
      </form>
    </div>
  );
}
