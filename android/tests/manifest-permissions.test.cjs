const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');

const permission = 'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION';
for (const variant of ['inherited', 'explicit', 'existing-tools']) {
  test(`generated ${variant} manifest excludes screen sharing but keeps call permissions`, () => {
    const prefix = path.join(os.tmpdir(), 'ayk-manifest-test-');
    const dir = fs.mkdtempSync(prefix);
    try {
      const main = path.join(dir, 'app/src/main');
      fs.mkdirSync(path.join(main, 'java/sa/aykdmh/app'), { recursive: true });
      const keys = path.join(dir, 'fixture-keys');
      fs.mkdirSync(keys);
      fs.writeFileSync(path.join(keys, 'google-services.json'), '{}');
      const tools = variant === 'existing-tools' ? ' xmlns:tools="http://schemas.android.com/tools"' : '';
      const declaration = variant === 'explicit' ? `<uses-permission android:name="${permission}"/>` : '';
      const file = path.join(main, 'AndroidManifest.xml');
      fs.writeFileSync(file, `<manifest xmlns:android="http://schemas.android.com/apk/res/android"${tools}>${declaration}<application/></manifest>`.replace('<application/>', '<application></application>'));
      fs.writeFileSync(path.join(dir, 'build.gradle'), 'buildscript { repositories { google() } }');
      fs.writeFileSync(path.join(dir, 'app/build.gradle'), "plugins { id 'com.android.application' }\ndependencies {\n}\n");
      const run = () => execFileSync(process.execPath, [path.join(__dirname, '../native/apply.cjs'), dir], {
        env: { ...process.env, KEYS_DIR: keys }, stdio: 'pipe',
      });
      run();
      const result = fs.readFileSync(file, 'utf8');
      const entry = result.match(new RegExp(`<uses-permission\\b[^>]*android:name="${permission.replaceAll('.', '\\.')}"[^>]*>`));
      assert.ok(entry, 'Explicit merger removal is required for dependency permissions');
      assert.match(entry[0], /tools:node="remove"/);
      assert.equal((result.match(/xmlns:tools=/g) || []).length, 1);
      for (const required of ['FOREGROUND_SERVICE_PHONE_CALL', 'FOREGROUND_SERVICE_CAMERA', 'FOREGROUND_SERVICE_MICROPHONE', 'CAMERA', 'RECORD_AUDIO']) {
        assert.ok(result.includes(`android.permission.${required}`));
      }
      assert.ok(result.includes('phoneCall|microphone|camera'));
      run();
      assert.equal(fs.readFileSync(file, 'utf8'), result, 'Manifest patch must be idempotent');
    } finally {
      assert.ok(path.resolve(dir).startsWith(path.resolve(prefix)));
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
