const { ApiError } = require('../middleware/errorHandler');

// Saudi Arabia has no daylight saving: local time is always UTC+3.
const LOCAL_OFFSET_MINUTES = 180;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = ['availability_status', 'vacation_from', 'vacation_to', 'work_days', 'work_from', 'work_to', 'work_schedule'];
const END = /^(([01]\d|2[0-3]):[0-5]\d|24:00)$/;
const MAX_PERIODS = 4;

const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

function localNow(now = new Date()) {
  const shifted = new Date(now.getTime() + LOCAL_OFFSET_MINUTES * 60000);
  return { date: shifted.toISOString().slice(0, 10), day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

function parseDays(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).split(',').map(Number);
}

// AYK-366: the week as seven lists of periods ([from, to], 'HH:MM'), or null for 24 hours every day.
// A saved weekly schedule wins; otherwise the older single setting (days + one period) is read.
function weekSchedule(profile = {}) {
  let saved = profile.work_schedule;
  if (typeof saved === 'string') { try { saved = JSON.parse(saved); } catch (_) { saved = null; } }
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    return [0, 1, 2, 3, 4, 5, 6].map(day => (Array.isArray(saved[day]) ? saved[day] : Array.isArray(saved[String(day)]) ? saved[String(day)] : [])
      .filter(p => Array.isArray(p) && TIME.test(p[0]) && END.test(p[1])).map(p => [p[0], p[1]]));
  }
  const days = parseDays(profile.work_days);
  const hours = profile.work_from && profile.work_to ? [[profile.work_from, profile.work_to]] : [['00:00', '24:00']];
  if (!days && !(profile.work_from && profile.work_to)) return null;
  return [0, 1, 2, 3, 4, 5, 6].map(day => (!days || days.includes(day) ? hours : []));
}
const endMinutes = value => (value === '24:00' ? 1440 : minutes(value));

// Inside a period now, today's or one of yesterday's that runs past midnight.
function insideSchedule(week, local) {
  const today = week[local.day] || [];
  const yesterday = week[(local.day + 6) % 7] || [];
  const m = local.minutes;
  for (const [from, to] of today) {
    const f = minutes(from), e = endMinutes(to);
    if (f < e ? m >= f && m < e : m >= f) return true;
  }
  for (const [from, to] of yesterday) {
    const f = minutes(from), e = endMinutes(to);
    if (f > e && m < e) return true;
  }
  return false;
}

// One of: available, paused, vacation, off_day, off_hours. Paused wins over a
// vacation; a past vacation is ignored without needing a cleanup job.
// AYK-366 (the owner): «متاح» is the provider's own word (not on leave, not stopped, inside their
// hours); «متواجد» is their app open now (`present`, from is_online). The two are separate.
function availability(profile = {}, now = new Date()) {
  const local = localNow(now);
  const week = weekSchedule(profile);
  const hours = profile.work_from && profile.work_to ? { from: profile.work_from, to: profile.work_to } : null;
  const base = {
    work_days: parseDays(profile.work_days), work_from: hours?.from || null, work_to: hours?.to || null,
    schedule: week, all_hours: week === null,
    ...(profile.is_online === undefined ? {} : { present: Number(profile.is_online) === 1 }),
    // AYK-478: when the account was last on the app, for «آخر ظهور» while it is not.
    ...(profile.last_seen_at && Number(profile.is_online) !== 1 ? { last_seen_at: new Date(profile.last_seen_at).toISOString() } : {}),
  };
  if (profile.availability_status === 'paused') return { state: 'paused', ...base };
  if (profile.vacation_from && profile.vacation_to && local.date >= profile.vacation_from && local.date <= profile.vacation_to) {
    return { state: 'vacation', until: profile.vacation_to, ...base };
  }
  if (week && !insideSchedule(week, local)) {
    const today = week[local.day] || [];
    return { state: today.length ? 'off_hours' : 'off_day', ...base };
  }
  return { state: 'available', ...base };
}

const empty = value => value === null || value === '';

// Validates only the fields present; returns the columns to store.
function validateAvailability(input, message = 'Invalid availability') {
  const out = {};
  if (!FIELDS.some(key => input[key] !== undefined)) return out;
  if (input.availability_status !== undefined) {
    if (!['active', 'paused'].includes(input.availability_status)) throw new ApiError(message, 400);
    out.availability_status = input.availability_status;
  }
  if (input.vacation_from !== undefined || input.vacation_to !== undefined) {
    const from = input.vacation_from, to = input.vacation_to;
    if (empty(from ?? null) && empty(to ?? null)) { out.vacation_from = null; out.vacation_to = null; }
    else if (typeof from !== 'string' || typeof to !== 'string' || !DATE.test(from) || !DATE.test(to) || from > to) throw new ApiError(message, 400);
    else { out.vacation_from = from; out.vacation_to = to; }
  }
  if (input.work_days !== undefined) {
    const days = input.work_days;
    if (days === null || (Array.isArray(days) && days.length === 7)) out.work_days = null;
    else if (!Array.isArray(days) || !days.length || days.some(day => !Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 6)) throw new ApiError(message, 400);
    else out.work_days = [...new Set(days.map(Number))].sort().join(',');
  }
  if (input.work_from !== undefined || input.work_to !== undefined) {
    const from = input.work_from, to = input.work_to;
    if (empty(from ?? null) && empty(to ?? null)) { out.work_from = null; out.work_to = null; }
    else if (typeof from !== 'string' || typeof to !== 'string' || !TIME.test(from) || !TIME.test(to) || from === to) throw new ApiError(message, 400);
    else { out.work_from = from; out.work_to = to; }
  }
  // AYK-366: a weekly schedule; null = 24 hours every day. Saving it clears the older single setting.
  if (input.work_schedule !== undefined) {
    const value = input.work_schedule;
    if (value === null) out.work_schedule = null;
    else {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(message, 400);
      const clean = {};
      for (const [key, periods] of Object.entries(value)) {
        if (!/^[0-6]$/.test(key) || !Array.isArray(periods) || periods.length > MAX_PERIODS) throw new ApiError(message, 400);
        const list = periods.map(period => {
          if (!Array.isArray(period) || period.length !== 2 || !TIME.test(period[0]) || !END.test(period[1]) || period[0] === period[1]) throw new ApiError(message, 400);
          return [period[0], period[1]];
        }).sort((a, b) => a[0].localeCompare(b[0]));
        if (list.length) clean[key] = list;
      }
      if (!Object.keys(clean).length) throw new ApiError(message, 400);
      out.work_schedule = JSON.stringify(clean);
    }
    out.work_days = null; out.work_from = null; out.work_to = null;
  } else if (out.work_days !== undefined || out.work_from !== undefined) {
    // An older app saving days and one period: that setting applies again.
    out.work_schedule = null;
  }
  return out;
}

module.exports = { availability, validateAvailability, localNow, weekSchedule, AVAILABILITY_FIELDS: FIELDS };
