// Helpers for the admin «نصوص الموقع» page (AYK-210).

// { a: { b: 'x' } } → [['a.b', 'x']]: every text of a locale file with its full key.
export function flattenTexts(node, prefix = '', out = []) {
  if (!node || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push([full, value]);
    else if (value && typeof value === 'object') flattenTexts(value, full, out);
  }
  return out;
}

// The parts of a text the code fills in or styles: {{name}} values and <1>…</1> tags.
// An edited text must keep exactly the same ones, or the page would show a broken text.
export function textPlaceholders(text) {
  const found = String(text || '').match(/\{\{\s*[\w.-]+\s*\}\}|<\/?\d+\s*\/?>/g) || [];
  return found.map(part => part.replace(/\s+/g, '')).sort();
}

export function samePlaceholders(original, edited) {
  const a = textPlaceholders(original);
  const b = textPlaceholders(edited);
  return a.length === b.length && a.every((part, i) => part === b[i]);
}

const normalize = value => String(value || '').toLocaleLowerCase()
  .replace(/[ً-ْـ]/g, '')
  .replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');

// Matches the key, the built-in text or the edited text, ignoring Arabic diacritics and letter forms.
export function matchesText(search, key, original, edited) {
  const words = normalize(search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = normalize(`${key} ${original} ${edited || ''}`);
  return words.every(word => haystack.includes(word));
}
