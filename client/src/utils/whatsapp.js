// A WhatsApp chat link for the support number set in the admin area (AYK-212). Saudi numbers may be
// written 05XXXXXXXX, 5XXXXXXXX, 9665…, +9665… or 009665…; wa.me wants the full international number.
export function whatsappNumber(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  else if (/^5\d{8}$/.test(digits)) digits = `966${digits}`;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : '';
}

export function whatsappLink(raw, text = '') {
  const number = whatsappNumber(raw);
  if (!number) return '';
  return `https://wa.me/${number}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
