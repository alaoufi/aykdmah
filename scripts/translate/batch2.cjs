// Collects the English strings outside the locale files that also need the new
// languages: reference names (catalog, geography, plans), server messages, the
// static showcase catalog, and the text nodes of HTML locale strings.
// Usage: node batch2.cjs <repo> <out.json>
const fs = require('fs');
const path = require('path');
const [repo, out] = process.argv.slice(2);
const set = new Set();
const add = s => { if (typeof s === 'string' && s.trim()) set.add(s.trim()); };

const ref = require(path.join(repo, 'client/src/data/referenceNames.json'));
for (const group of ['catalog', 'geography', 'plans']) for (const e of ref[group]) add(e.en);

process.env.NODE_ENV = 'test';
const { MESSAGES } = (() => {
  const src = fs.readFileSync(path.join(repo, 'server/utils/i18n.js'), 'utf8');
  const m = src.match(/const MESSAGES = (\{[\s\S]*?\n\});/);
  return { MESSAGES: Function(`return ${m[1]}`)() };
})();
for (const v of Object.values(MESSAGES)) add(v.en);

const catalog = fs.readFileSync(path.join(repo, 'client/src/data/servicesCatalog.js'), 'utf8');
for (const m of catalog.matchAll(/L\('(?:[^'\\]|\\.)*','((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"));

const en = require(path.join(repo, 'client/src/i18n/locales/en.json'));
const walk = o => { for (const v of Object.values(o)) { if (typeof v === 'string') { if (/<[a-z][^>]*>/i.test(v)) for (const t of v.matchAll(/>([^<]+)</g)) add(t[1]); } else walk(v); } };
walk(en);

fs.writeFileSync(out, JSON.stringify([...set]));
console.log(set.size, 'strings');
