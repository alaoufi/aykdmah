// Saudi mobile numbers as typed by people: Arabic or Persian digits, spaces and
// dashes are accepted; 05XXXXXXXX, 5XXXXXXXX, 9665…, +9665… and 009665… are valid.
export function cleanPhone(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .trim().replace(/[\s()-]/g, '');
}

export function isSaudiMobile(value) {
  return /^(?:\+966|00966|966|0)?5\d{8}$/.test(cleanPhone(value));
}
