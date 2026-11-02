const fs = require('node:fs');
const assert = require('node:assert/strict');
assert.ok(fs.existsSync('/work/.ayk-native-test-copy'), 'Only isolated test copies are allowed');
const manifest = JSON.parse(fs.readFileSync('/source/twa-manifest.json', 'utf8'));
assert.equal(manifest.packageId, 'sa.aykdmh.app');
assert.match(manifest.appVersionName, /^\d+\.\d+\.\d+$/);
assert.ok(Number.isSafeInteger(manifest.appVersionCode));
const file = '/work/app/build.gradle';
let text = fs.readFileSync(file, 'utf8');
assert.match(text, /versionCode\s+\d+/);
assert.match(text, /versionName\s+["'][^"']+["']/);
text = text.replace(/versionCode\s+\d+/, `versionCode ${manifest.appVersionCode}`)
  .replace(/versionName\s+["'][^"']+["']/, `versionName "${manifest.appVersionName}"`);
fs.writeFileSync(file, text);
fs.copyFileSync('/source/twa-manifest.json', '/work/twa-manifest.json');
