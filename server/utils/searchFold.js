// AYK-492: one way to search names and numbers in the admin lists (as the users list does since AYK-452):
// the Arabic letters أ إ آ ة ى match ا ا ا ه ي, case is ignored, and a phone is compared by its digits
// whatever way it was typed (+966…, 00966…, Arabic digits).
const ARABIC_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const latinDigits = text => String(text).replace(/[٠-٩۰-۹]/g, ch => ARABIC_DIGITS[ch]);
const foldSql = column => `translate(lower(COALESCE(${column}, '')), 'أإآةى', 'اااهي')`;
const foldText = text => latinDigits(text).toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
// The digits to look for in a phone number (without the country code or the leading zero); null when too short.
const phoneDigits = text => {
  const digits = latinDigits(text).replace(/\D/g, '').replace(/^(00)?966/, '').replace(/^0/, '');
  return digits.length >= 3 ? digits : null;
};
const likeEscape = text => String(text).replace(/[\\%_]/g, ch => `\\${ch}`);
// A ready `(… OR …)` condition and its parameters for the given text columns, phone column and exact-code column.
function searchCondition(text, { columns = [], phone = null, exact = null, extra = '' } = {}) {
  const folded = `%${likeEscape(foldText(text))}%`;
  const parts = columns.map(column => `${foldSql(column)} LIKE ?`);
  const params = columns.map(() => folded);
  const digits = phone ? phoneDigits(text) : null;
  if (digits) { parts.push(`regexp_replace(COALESCE(${phone}, ''), '\\D', '', 'g') LIKE ?`); params.push(`%${digits}%`); }
  if (exact) { parts.push(`${foldSql(exact)} = ?`); params.push(foldText(text).trim()); }
  if (extra) parts.push(extra);
  return { sql: `(${parts.join(' OR ')})`, params };
}
module.exports = { foldSql, foldText, phoneDigits, searchCondition };
