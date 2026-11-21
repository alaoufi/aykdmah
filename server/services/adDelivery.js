// AYK-409: which live ads a visitor gets, and in what order (the professional ad servers' rules).
// SQL (Ad.listLive) already keeps only ads that are active, in their dates, under their total,
// daily and campaign caps and their even pacing. Here, per request:
//  * the weekly schedule, in Saudi time (UTC+3, no daylight saving);
//  * targeting by device, language and audience (visitor, requester, provider);
//  * the order: priority first (1 high, 2 normal, 3 fallback), then a weighted random draw, so an
//    ad of weight 3 is first about three times as often as one of weight 1 (A/B rotation).
// The per-visitor daily cap (frequency) is applied on the device (AdSlot), which knows its views.
const SAUDI_OFFSET_MIN = 180;
const list = value => (Array.isArray(value) ? value : []);

function saudiNow(now = new Date()) {
  const t = new Date(now.getTime() + SAUDI_OFFSET_MIN * 60000);
  return { day: t.getUTCDay(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
const toMinutes = hhmm => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

function inSchedule(schedule, now = new Date()) {
  if (!schedule || typeof schedule !== 'object') return true;
  const { day, minutes } = saudiNow(now);
  const days = list(schedule.days).map(Number);
  if (days.length && !days.includes(day)) return false;
  const from = toMinutes(schedule.from), to = toMinutes(schedule.to);
  if (from == null || to == null || from === to) return true;
  // A window past midnight (e.g. 20:00 to 02:00) wraps around.
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

function contextOf(req) {
  const asked = String(req.query?.device || '').toLowerCase();
  const ua = String(req.headers?.['user-agent'] || '');
  const device = ['mobile', 'desktop'].includes(asked) ? asked : /Mobi|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
  const lang = String(req.query?.lang || req.lang || 'ar').toLowerCase().split(/[-_]/)[0];
  const audience = !req.user ? 'guest' : req.user.role === 'provider' ? 'provider' : 'client';
  return { device, lang, audience };
}

function matchesContext(ad, ctx) {
  const devices = list(ad.target_devices), langs = list(ad.target_langs), audience = list(ad.target_audience);
  if (devices.length && !devices.includes(ctx.device)) return false;
  if (langs.length && !langs.includes(ctx.lang)) return false;
  if (audience.length && !audience.includes(ctx.audience)) return false;
  return true;
}

// Weighted random order inside each priority (Efraimidis–Spirakis: key = u^(1/w)).
function order(ads, random = Math.random) {
  const keyed = ads.map(ad => ({ ad, p: Number(ad.priority) || 2, k: Math.pow(random(), 1 / Math.max(1, Number(ad.weight) || 1)) }));
  keyed.sort((a, b) => a.p - b.p || b.k - a.k);
  return keyed.map(x => x.ad);
}

function deliver(ads, req, now = new Date()) {
  const ctx = contextOf(req);
  return order(ads.filter(ad => inSchedule(ad.schedule, now) && matchesContext(ad, ctx)));
}

module.exports = { inSchedule, contextOf, matchesContext, order, deliver, saudiNow };
