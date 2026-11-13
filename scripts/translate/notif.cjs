// Adds the English notification templates to the second translation batch.
// Usage: node notif.cjs <repo> <strings2.json>
const fs = require('fs');
const path = require('path');
const [repo, out] = process.argv.slice(2);
const src = fs.readFileSync(path.join(repo, 'client/src/data/notificationLabels.js'), 'utf8');
const set = new Set(JSON.parse(fs.readFileSync(out, 'utf8')));
for (const m of src.matchAll(/"en": ("(?:[^"\\]|\\.)*")/g)) set.add(JSON.parse(m[1]));
fs.writeFileSync(out, JSON.stringify([...set]));
console.log(set.size);
