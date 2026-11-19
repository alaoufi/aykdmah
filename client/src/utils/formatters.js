import i18n from '../i18n';

export function activeLocale() {
  return (i18n.resolvedLanguage || i18n.language || 'ar').split(/[-_]/)[0];
}

export function formatDate(date, withTime = false) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  if (withTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return d.toLocaleDateString(activeLocale(), options);
}

export function formatTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(activeLocale(), { hour: '2-digit', minute: '2-digit' });
}

export function isSameDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear()
      && da.getMonth() === db.getMonth()
      && da.getDate() === db.getDate();
}

export function dayLabel(date, t) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (isSameDay(d, today)) return (t || i18n.t.bind(i18n))('chat.today');
  if (isSameDay(d, yesterday)) return (t || i18n.t.bind(i18n))('chat.yesterday');
  return d.toLocaleDateString(activeLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRelativeTime(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  const relative = new Intl.RelativeTimeFormat(activeLocale(), { numeric: 'auto' });
  if (diff < 60) return relative.format(0, 'second');
  if (diff < 3600) return relative.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return relative.format(-Math.floor(diff / 3600), 'hour');
  if (diff < 604800) return relative.format(-Math.floor(diff / 86400), 'day');
  return formatDate(date);
}

// Symbols for every currency we ship as a country default.
// Anything missing falls back to the ISO code (so e.g. CHF still
// renders as 'CHF' instead of nothing).
const CURRENCY_SYMBOLS = {
  SAR: 'ر.س', AED: 'د.إ', KWD: 'د.ك', QAR: 'ر.ق', BHD: 'د.ب', OMR: 'ر.ع',
  YER: 'ر.ي', EGP: 'ج.م', JOD: 'د.أ', LBP: 'ل.ل', SYP: 'ل.س', IQD: 'د.ع',
  MAD: 'د.م', DZD: 'د.ج', TND: 'د.ت', LYD: 'د.ل', SDG: 'ج.س',
  MRU: 'أ.م', SOS: 'ش.ص', KMF: 'ف.ق', DJF: 'ف.ج', ILS: '₪',
  USD: '$', EUR: '€', GBP: '£',
};

// Reads the active country's currency (set by useCountry) on each
// formatCurrency call so prices recolour when the user picks a
// different country. The currency cache mirror is updated whenever
// the hook resolves a new country.
let _activeCurrency = null; // { code, symbol }
export function setActiveCurrency({ code, symbol } = {}) {
  if (!code) { _activeCurrency = null; return; }
  _activeCurrency = { code, symbol: symbol || CURRENCY_SYMBOLS[code] || code };
}

export function formatCurrency(amount, currency) {
  if (amount == null) return '';
  const n = Number(amount);
  if (isNaN(n)) return '';
  const code = currency || _activeCurrency?.code || 'SAR';
  const symbol = (currency ? null : _activeCurrency?.symbol)
                 || CURRENCY_SYMBOLS[code] || code;
  const lang = activeLocale();
  const label = lang === 'ar' ? symbol : code === 'SAR' ? i18n.t('common.currency') : code;
  return `${n.toLocaleString(lang, { maximumFractionDigits: 2 })} ${label}`;
}

export function truncate(str, max = 100) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

export function initialsOf(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(p => p[0]).join('').toUpperCase();
}

export function formatDistance(km) {
  if (km == null || !Number.isFinite(Number(km)) || Number(km) < 0) return '';
  km = Number(km);
  if (km < 1) return `${Math.round(km * 1000).toLocaleString(activeLocale())} ${i18n.t('common.meter_short')}`;
  return `${km.toLocaleString(activeLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${i18n.t('common.kilometer_short')}`;
}
