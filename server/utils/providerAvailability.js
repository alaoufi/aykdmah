const { ApiError } = require('../middleware/errorHandler');

// Saudi Arabia has no daylight saving: local time is always UTC+3.
const LOCAL_OFFSET_MINUTES = 180;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const FIELDS = ['availability_status', 'vacation_from', 'vacation_to', 'work_days', 'work_from', 'work_to'];

const minutes = value => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

function localNow(now = new Date()) {
  const shifted = new Date(now.getTime() + LOCAL_OFFSET_MINUTES * 60000);
  return { date: shifted.toISOString().slice(0, 10), day: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

function parseDays(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value).split(',').map(Number);
}

// One of: available, paused, vacation, off_day, off_hours. Paused wins over a
// vacation; a past vacation is ignored without needing a cleanup job.
function availability(profile = {}, now = new Date()) {
  const local = localNow(now);
  const hours = profile.work_from && profile.work_to ? { from: profile.work_from, to: profile.work_to } : null;
  const base = { work_days: parseDays(profile.work_days), work_from: hours?.from || null, work_to: hours?.to || null };
  if (profile.availability_status === 'paused') return { state: 'paused', ...base };
  if (profile.vacation_from && profile.vacation_to && local.date >= profile.vacation_from && local.date <= profile.vacation_to) {
    return { state: 'vacation', until: profile.vacation_to, ...base };
  }
  if (base.work_days && !base.work_days.includes(local.day)) return { state: 'off_day', ...base };
  if (hours) {
    const from = minutes(hours.from), to = minutes(hours.to);
    const inside = from <= to ? local.minutes >= from && local.minutes < to : local.minutes >= from || local.minutes < to;
    if (!inside) return { state: 'off_hours', ...base };
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
  return out;
}

module.exports = { availability, validateAvailability, localNow, AVAILABILITY_FIELDS: FIELDS };
