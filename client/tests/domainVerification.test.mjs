import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// AYK-466 (the owner: «يُضاف على الكود إثبات ملكية، ويبقى دائمًا»): the ownership tag must never be
// dropped from the page head by a later change.
test('the domain-verification tag stays in the page head', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('<meta name="domain-verification" content="19e126edde9457ce741a3d0d04c4d79e336663d78c0ca2fffbaacc9e30f218fc">'));
});
