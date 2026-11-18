// A "tel:" link for a number the person typed (AYK-261): spaces, dashes and brackets removed,
// Arabic-Indic digits accepted. '' when it is not a phone number (7 to 15 digits, optional +).
export function plainPhone(raw) {
  const digits = String(raw ?? '').trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s().-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(digits) ? digits : '';
}

export function telLink(raw) {
  const number = plainPhone(raw);
  return number ? `tel:${number}` : '';
}
