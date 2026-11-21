// AYK-354 (the owner): a short invite link, aykdmh.com/i/<number>. Whoever opens it and then signs
// up is counted for the inviter, also when they look around the site first or sign up a few days
// later on this device: the number is kept here for 30 days, until a sign-up uses it.
const KEY = 'ayk_invite';
const DAYS = 30;
export const inviteLink = code => `https://aykdmh.com/i/${encodeURIComponent(code)}`;
const VALID = /^(\d{2,6}|[A-Z]{2,4}\d{2,4})$/;
export function keepInvite(code) {
  const value = String(code || '').trim().toUpperCase();
  if (!VALID.test(value)) return '';
  try { localStorage.setItem(KEY, JSON.stringify({ code: value, at: Date.now() })); } catch (_) { /* private mode */ }
  return value;
}
export function keptInvite() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && VALID.test(saved.code) && Date.now() - Number(saved.at) < DAYS * 24 * 3600 * 1000) return saved.code;
  } catch (_) { /* private mode */ }
  return '';
}
export function forgetInvite() { try { localStorage.removeItem(KEY); } catch (_) { /* private mode */ } }
