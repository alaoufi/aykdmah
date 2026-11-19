// AYK-314: the numbers a provider chose to show on their page and in «دليلي». Both are off until the
// provider turns them on. The mobile is the account's own phone; WhatsApp may be another number and,
// when it is shown without its own number, the mobile is used for WhatsApp too.

// "+966 50 123-4567" -> "+966501234567"; Arabic-Indic digits are accepted. '' when not a number.
function phoneNumber(value) {
  const digits = String(value ?? '').trim()
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\s().-]/g, '');
  return /^\+?[0-9]{7,15}$/.test(digits) ? digits : '';
}

// The same number written two ways ("0501234567", "+966501234567", "00966501234567") compares equal.
function sameNumberKey(value) {
  let digits = phoneNumber(value).replace(/^\+/, '').replace(/^00/, '');
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  return digits;
}

// row: phone (users.phone), show_phone, whatsapp, show_whatsapp from provider_profiles.
function publicContact(row) {
  const phone = Number(row?.show_phone) === 1 ? phoneNumber(row.phone) || null : null;
  const whatsapp = Number(row?.show_whatsapp) === 1 ? phoneNumber(row.whatsapp) || phoneNumber(row.phone) || null : null;
  return { public_phone: phone, public_whatsapp: whatsapp };
}

module.exports = { phoneNumber, sameNumberKey, publicContact };
