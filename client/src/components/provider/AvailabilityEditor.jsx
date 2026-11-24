import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { me, updateProviderProfile } from '../../services/authService';
import { apiError } from '../../services/api';
import Button from '../common/Button';
import AvailabilityBadge, { PresenceTag, weekdayName, weekOf, timeLabel } from '../common/AvailabilityBadge';

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// Half-hour steps; a period may end at midnight ('24:00') or after it (to < from).
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const ENDS = [...SLOTS.slice(1), '24:00'];
const MAX_PERIODS = 4;
const emptyWeek = () => ALL_DAYS.map(() => []);

// Vacation dates, pause/resume, and when the provider works (AYK-029). AYK-366 (the owner): «متاح 24
// ساعة» or a weekly schedule with one or more periods each day (a different set for Friday, say).
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
      week: weekOf(p.availability) || null,
    });
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const save = async changes => {
    const next = { ...state, ...changes };
    if ((next.vacation_from && !next.vacation_to) || (!next.vacation_from && next.vacation_to)) { onError(t('availability.vacation_both')); return; }
    let schedule = null;
    if (next.week) {
      schedule = {};
      next.week.forEach((periods, day) => { if (periods.length) schedule[day] = periods; });
      if (!Object.keys(schedule).length) { onError(t('availability.schedule_required')); return; }
    }
    setSaving(true); onError(''); onSaved('');
    try {
      await updateProviderProfile({
        availability_status: next.availability_status,
        vacation_from: next.vacation_from || null, vacation_to: next.vacation_to || null,
        work_schedule: schedule,
      });
      await load();
      onSaved(t('availability.saved'));
    } catch (err) { onError(apiError(err)); }
    finally { setSaving(false); }
  };

  if (!state) return null;
  const paused = state.availability_status === 'paused';
  const setWeek = update => setState(previous => ({ ...previous, week: update(previous.week || emptyWeek()) }));
  const setDay = (day, periods) => setWeek(week => week.map((list, i) => (i === day ? periods : list)));
  const toggleDay = day => setWeek(week => week.map((list, i) => (i === day ? (list.length ? [] : [['08:00', '17:00']]) : list)));
  const label = value => timeLabel(value, lang, t);
  return (
    <div className="card mb-4 space-y-3" id="availability">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="m-0">🗓️ {t('availability.title')}</h3>
        <span className="flex items-center gap-2 flex-wrap"><AvailabilityBadge availability={status} /><PresenceTag present={status?.present} lastSeen={status?.last_seen_at} /></span>
      </div>

      {status?.state === 'no_alerts' && (
        <p className="m-0 rounded-card border border-rose-300 bg-rose-50 text-rose-900 px-3 py-2 text-[13px] font-semibold" role="alert" data-testid="no-alerts-self">
          🔔 {t('availability.no_alerts_self')} <a href="/profile#call-alerts" className="underline font-bold">{t('availability.no_alerts_link')}</a>
        </p>
      )}
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

        <fieldset className="border-0 p-0 m-0 min-w-0" data-testid="schedule-editor">
          <legend className="form-label">🕐 {t('availability.work_hours')}</legend>
          <div className="flex gap-2 flex-wrap mb-2">
            {[['24h', `🕐 ${t('availability.mode_24h')}`], ['week', `🗓️ ${t('availability.mode_schedule')}`]].map(([mode, text]) => {
              const on = mode === '24h' ? !state.week : Boolean(state.week);
              return <button key={mode} type="button" aria-pressed={on} data-testid={`mode-${mode}`}
                onClick={() => setState(previous => ({ ...previous, week: mode === '24h' ? null : (previous.week || ALL_DAYS.map(() => [['08:00', '17:00']])) }))}
                className={`px-3 py-1.5 rounded-pill border text-[13px] ${on ? 'border-primary bg-primary-soft font-bold' : 'border-border bg-surface-alt text-fg-muted'}`}>{text}</button>;
            })}
          </div>
          {state.week && (
            <div className="space-y-2">
              <p className="text-[11.5px] text-fg-subtle m-0">{t('availability.schedule_hint')}</p>
              {ALL_DAYS.map(day => {
                const periods = state.week[day] || [];
                return (
                  <div key={day} className="rounded-card border border-border p-2" data-testid={`day-${day}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <label className="flex items-center gap-2 font-semibold text-[13.5px] cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 accent-primary" checked={periods.length > 0} onChange={() => toggleDay(day)} />
                        {weekdayName(day, lang, 'long')}
                      </label>
                      {!periods.length && <span className="text-[12px] text-fg-muted">{t('availability.day_off')}</span>}
                      {periods.length > 0 && <button type="button" className="text-[11.5px] text-primary font-semibold bg-transparent border-0 p-0"
                        onClick={() => setWeek(week => week.map(() => periods.map(p => [...p])))}>{t('availability.copy_all')}</button>}
                    </div>
                    {periods.map(([from, to], index) => (
                      <div key={index} className="flex items-center gap-1.5 mt-1.5">
                        <select className="select flex-1" value={from} aria-label={t('availability.from')}
                          onChange={e => setDay(day, periods.map((p, i) => (i === index ? [e.target.value, p[1]] : p)))}>
                          {SLOTS.map(slot => <option key={slot} value={slot}>{label(slot)}</option>)}
                        </select>
                        <span className="text-fg-muted text-[12px]">–</span>
                        <select className="select flex-1" value={to} aria-label={t('availability.to')}
                          onChange={e => setDay(day, periods.map((p, i) => (i === index ? [p[0], e.target.value] : p)))}>
                          {ENDS.map(slot => <option key={slot} value={slot}>{label(slot)}</option>)}
                        </select>
                        <button type="button" className="px-2 py-1 rounded-pill border border-border text-[12px]" aria-label={t('availability.remove_period')}
                          onClick={() => setDay(day, periods.filter((_, i) => i !== index))}>✕</button>
                      </div>
                    ))}
                    {periods.length > 0 && periods.length < MAX_PERIODS && (
                      <button type="button" className="mt-1.5 text-[12px] text-primary font-semibold bg-transparent border-0 p-0" data-testid={`add-period-${day}`}
                        onClick={() => setDay(day, [...periods, ['16:00', '22:00']])}>➕ {t('availability.add_period')}</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </fieldset>

        <Button type="submit" variant="primary" block loading={saving}>{t('availability.save')}</Button>
      </form>
    </div>
  );
}
