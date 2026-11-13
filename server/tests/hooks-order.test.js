const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// AYK-140: a React hook placed after a component's early `return` crashes the page ("Rendered
// more hooks than during the previous render", error #310) once the data arrives. This scans
// every component in the site so it cannot slip in again.
const root = path.join(__dirname, '..', '..', 'client', 'src');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full);
    return /\.jsx$/.test(entry.name) ? [full] : [];
  });
}

function hooksAfterEarlyReturn(source) {
  const found = [];
  let inComponent = false; let base = 0; let depth = 0; let returned = false;
  source.split(/\r?\n/).forEach((line, index) => {
    if (/^(export default )?function [A-Z]\w*\(/.test(line)) { inComponent = true; returned = false; base = depth; }
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;
    const top = inComponent && depth === base + 1;
    if (top && /^\s{2}if \(.*\) return\b/.test(line)) returned = true;
    if (top && returned && /^\s{2}const .*\buse[A-Z]\w*\(/.test(line)) found.push(`${index + 1}: ${line.trim()}`);
    depth += opens - closes;
    if (inComponent && closes && depth <= base) inComponent = false;
  });
  return found;
}

test('the scan catches a hook after an early return', () => {
  const bad = 'export default function Page() {\n  const [a] = useState(1);\n  if (!a) return null;\n  const [b] = useState(2);\n  return b;\n}\n';
  assert.deepEqual(hooksAfterEarlyReturn(bad), ['4: const [b] = useState(2);']);
});

test('no component calls a hook after an early return', { skip: !fs.existsSync(root) }, () => {
  const problems = files(root).flatMap(file =>
    hooksAfterEarlyReturn(fs.readFileSync(file, 'utf8')).map(hit => `${path.relative(root, file)}:${hit}`));
  assert.deepEqual(problems, []);
});
