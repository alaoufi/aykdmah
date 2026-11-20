// Saudi mobile numbers as typed by people: Arabic or Persian digits, spaces and
// dashes are accepted; 05XXXXXXXX, 5XXXXXXXX, 9665…, +9665… and 009665… are valid.
// AYK-358: a number copied from WhatsApp or the contacts carries hidden direction marks
// («\u202A+966 50 123 4567\u202C»). They are removed, and Arabic digits become Latin digits.
const HIDDEN_MARKS = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u061C]/g;
export function cleanTyped(value) {
  return String(value || '')
    .replace(HIDDEN_MARKS, '')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}

export function cleanPhone(value) {
  return String(value || '')
    .replace(HIDDEN_MARKS, '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .trim().replace(/[\s()-]/g, '');
}

export function isSaudiMobile(value) {
  return /^(?:\+966|00966|966|0)?5\d{8}$/.test(cleanPhone(value));
}
