// Merges the machine translations (English -> new language maps) into the repo:
// locale files, reference names, the showcase catalog, server messages and
// notification templates. Usage: node merge.cjs <repo> <mtDir>
// mtDir contains out/<lang>.json (locale strings) and out2/<lang>.json (the rest).
const fs = require('fs');
const path = require('path');
const [repo, mtDir] = process.argv.slice(2);
const LANGS = ['ml', 'fil', 'id', 'ne', 'am', 'tr'];
const NATIVE = { malayalam: 'മലയാളം', filipino: 'Filipino', indonesian: 'Bahasa Indonesia', nepali: 'नेपाली', amharic: 'አማርኛ', turkish: 'Türkçe' };
const load = p => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {});
const maps = Object.fromEntries(LANGS.map(l => [l, { ...load(path.join(mtDir, 'out2', `${l}.json`)), ...load(path.join(mtDir, 'out', `${l}.json`)) }]));
const PH = /\{\{\s*(\w+)\s*\}\}/g;
const placeholders = s => [...String(s).matchAll(PH)].map(m => m[1]).sort().join(',');

function tr(lang, en) {
  if (typeof en !== 'string' || !en.trim()) return en;
  const map = maps[lang];
  if (/<[a-z][^>]*>/i.test(en)) {
    // HTML: translate each text node and keep the markup exactly.
    return en.replace(/>([^<]+)</g, (all, text) => `>${text.replace(text.trim(), map[text.trim()] || text.trim())}<`);
  }
  const out = map[en] ?? map[en.trim()];
  if (!out) return null;
  return placeholders(out) === placeholders(en) ? out : null;
}

// 1) Locale files, built from the English structure.
const writeJson = (file, data) => {
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  let out = `${JSON.stringify(data, null, 2)}\n`;
  if (raw.includes('\r\n')) out = out.replace(/\n/g, '\r\n');
  fs.writeFileSync(file, out);
};
const localeDir = path.join(repo, 'client/src/i18n/locales');
const en = JSON.parse(fs.readFileSync(path.join(localeDir, 'en.json'), 'utf8'));
const missing = Object.fromEntries(LANGS.map(l => [l, []]));
for (const lang of LANGS) {
  const build = (node, prefix) => Object.fromEntries(Object.entries(node).map(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') return [k, build(v, key)];
    // Brand and the language names stay as written (native names).
    if (key === 'common.brand' || (prefix === 'language' && k !== 'label')) return [k, v];
    const t = tr(lang, v);
    if (t == null) { missing[lang].push(key); return [k, v]; }
    return [k, t];
  }));
  writeJson(path.join(localeDir, `${lang}.json`), build(en, ''));
}
// Native names of the new languages in every locale (the picker and local translation).
for (const file of fs.readdirSync(localeDir).filter(f => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(localeDir, file), 'utf8'));
  Object.assign(data.language, NATIVE);
  writeJson(path.join(localeDir, file), data);
}

// 2) Reference names (catalog, geography, plans): looked up by Arabic/English pair.
const refPath = path.join(repo, 'client/src/data/referenceNames.json');
const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
for (const group of ['catalog', 'geography', 'plans']) {
  for (const entry of ref[group]) for (const lang of LANGS) { const t = tr(lang, entry.en); if (t) entry[lang] = t; }
}
writeJson(refPath, ref);

// 3) Showcase catalog: extra languages looked up by the English text.
const extra = {};
const catalogSrc = fs.readFileSync(path.join(repo, 'client/src/data/servicesCatalog.js'), 'utf8');
for (const m of catalogSrc.matchAll(/L\('(?:[^'\\]|\\.)*','((?:[^'\\]|\\.)*)'/g)) {
  const text = m[1].replace(/\\'/g, "'");
  extra[text] = Object.fromEntries(LANGS.map(l => [l, tr(l, text)]).filter(([, v]) => v));
}
writeJson(path.join(repo, 'client/src/data/catalogExtraLanguages.json'), extra);

// 4) Server messages: add the new languages to every entry.
const i18nPath = path.join(repo, 'server/utils/i18n.js');
let i18nSrc = fs.readFileSync(i18nPath, 'utf8');
const block = i18nSrc.match(/const MESSAGES = (\{[\s\S]*?\n\});/);
const MESSAGES = Function(`return ${block[1]}`)();
const lines = Object.entries(MESSAGES).map(([key, value]) => {
  for (const lang of LANGS) { const t = tr(lang, value.en); if (t) value[lang] = t; }
  return `  ${key}: ${JSON.stringify(value)},`;
});
i18nSrc = i18nSrc.replace(block[0], `const MESSAGES = {\n${lines.join('\n')}\n};`);
fs.writeFileSync(i18nPath, i18nSrc);

// 5) Notification templates.
const notifPath = path.join(repo, 'client/src/data/notificationLabels.js');
let notifSrc = fs.readFileSync(notifPath, 'utf8');
const nb = notifSrc.match(/const labels = (\{[\s\S]*?\n\});/);
const labels = JSON.parse(nb[1]);
const addLangs = node => {
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') for (const lang of LANGS) { const t = tr(lang, node.en); if (t) node[lang] = t; }
    else for (const v of Object.values(node)) addLangs(v);
  }
};
addLangs(labels);
notifSrc = notifSrc.replace(nb[0], `const labels = ${JSON.stringify(labels, null, 2)};`);
fs.writeFileSync(notifPath, notifSrc);

for (const lang of LANGS) console.log(lang, 'untranslated keys:', missing[lang].length, missing[lang].slice(0, 5).join(' '));
