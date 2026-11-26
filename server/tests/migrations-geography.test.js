// AYK-505 (the owner: «تعديل الأحياء وإضافة أحياء وتحتفظ فيها مع أي تحديث»): the districts, cities and regions the
// administration edits or adds belong to the owner. A migration added from now on may not rewrite or remove them unless it
// says so on purpose and only touches rows still holding the original value (the marker `keeps-admin-edits`).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', '..', 'database', 'migrations');
const FIRST_GUARDED = 121;
const PLACES = /\b(districts|cities|governorates|regions|countries)\b/i;
const REWRITE = /\b(?:UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+(?:ONLY\s+)?(districts|cities|governorates|regions|countries)\b/i;

test('migrations from 121 on never rewrite or remove the places the administration edited, unless they say they keep the edits', () => {
  const offenders = [];
  for (const file of fs.readdirSync(dir).filter(f => /^\d+_.*\.sql$/.test(f))) {
    if (Number(file.split('_')[0]) < FIRST_GUARDED) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const code = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
    if (PLACES.test(code) && REWRITE.test(code) && !/keeps-admin-edits/i.test(sql)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `these migrations rewrite places without the «keeps-admin-edits» note: ${offenders.join(', ')}`);
});

test('the guard itself recognises a rewriting migration', () => {
  assert.ok(REWRITE.test('UPDATE districts SET name_ar = x'));
  assert.ok(REWRITE.test('DELETE FROM cities WHERE id = 1'));
  assert.ok(!REWRITE.test('INSERT INTO districts (name_ar) VALUES (x) ON CONFLICT DO NOTHING'));
});
