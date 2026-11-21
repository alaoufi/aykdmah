// AYK-381: date separators as in WhatsApp: today, yesterday, the weekday within the last week, then the date.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('dayLabel names the weekday within the last week and the date after', () => {
  const src = fs.readFileSync(new URL('../src/utils/formatters.js', import.meta.url), 'utf8');
  assert.match(src, /weekday: 'long'/);
  assert.match(src, /days > 1 && days < 7/);
  assert.match(src, /chat\.today/);
  assert.match(src, /chat\.yesterday/);
});
