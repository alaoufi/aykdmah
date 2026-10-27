#!/usr/bin/env node
// Reconstructed recovery helper; the original root scripts were not deployed.
// Read-only: missing translations require a translator, never fabricated copy.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const languages = ['ar', 'en', 'ur', 'hi', 'bn'];
const directory = path.join(root, 'client/src/i18n/locales');
function flatten(value, prefix = '', result = {}) {
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object' && !Array.isArray(item)) flatten(item, name, result);
    else result[name] = item;
  }
  return result;
}
const values = Object.fromEntries(languages.map(language => [language, flatten(JSON.parse(fs.readFileSync(path.join(directory, `${language}.json`), 'utf8')))]));
const reference = values.ar;
const placeholders = value => typeof value === 'string' ? [...value.matchAll(/{{\s*([^{}]+?)\s*}}/g)].map(match => match[1]).sort() : [];
const errors = [];
for (const language of languages) {
  for (const key of new Set([...Object.keys(reference), ...Object.keys(values[language])])) {
    if (!Object.hasOwn(reference, key)) errors.push(`${language}: extra key ${key}`);
    else if (!Object.hasOwn(values[language], key)) errors.push(`${language}: missing key ${key}`);
    else if (typeof reference[key] !== typeof values[language][key]) errors.push(`${language}: type mismatch ${key}`);
    else if (JSON.stringify(placeholders(reference[key])) !== JSON.stringify(placeholders(values[language][key]))) errors.push(`${language}: interpolation mismatch ${key}`);
    else if (typeof values[language][key] === 'string' && /\uFFFD/.test(values[language][key])) errors.push(`${language}: invalid replacement character ${key}`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  if (process.argv.includes('--fix')) console.error('Automatic translation repair is unavailable in this reconstructed checker. No locale files were changed.');
  process.exitCode = 1;
} else console.log(`All ${languages.length} locales share ${Object.keys(reference).length} keys and matching interpolation variables. No files changed.`);
