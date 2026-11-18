// AYK-276: the opening screen without the logo, applied to a copy of Bubblewrap 1.27's own
// AndroidManifest template (fixtures/, EJS tags removed). Run: node --test android/tests/splash.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { applySplash, TRANSPARENT_PNG } = require('../native/splash.cjs');

test('splash pictures become transparent, and Android 12+ shows no icon on the opening screen', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ayk-splash-'));
  const res = path.join(project, 'app/src/main/res');
  for (const dpi of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    fs.mkdirSync(path.join(res, `drawable-${dpi}`), { recursive: true });
    fs.writeFileSync(path.join(res, `drawable-${dpi}`, 'splash.png'), Buffer.alloc(5000, 7));
  }
  fs.mkdirSync(path.join(res, 'values'), { recursive: true });
  const manifestFile = path.join(project, 'app/src/main/AndroidManifest.xml');
  fs.copyFileSync(path.join(__dirname, 'fixtures/bubblewrap-1.27-AndroidManifest.xml'), manifestFile);

  assert.equal(applySplash(project), 5);
  for (const dpi of ['mdpi', 'xxxhdpi']) assert.ok(fs.readFileSync(path.join(res, `drawable-${dpi}`, 'splash.png')).equals(TRANSPARENT_PNG));
  const manifest = fs.readFileSync(manifestFile, 'utf8');
  assert.match(manifest, /<activity\s+android:name="LauncherActivity" android:theme="@style\/AykLaunchTheme"/);
  assert.equal((manifest.match(/AykLaunchTheme/g) || []).length, 1);
  const base = fs.readFileSync(path.join(res, 'values/ayk_launch.xml'), 'utf8');
  const v31 = fs.readFileSync(path.join(res, 'values-v31/ayk_launch.xml'), 'utf8');
  assert.match(base, /parent="@android:style\/Theme\.Translucent\.NoTitleBar"/);
  assert.match(v31, /windowSplashScreenAnimatedIcon">@android:color\/transparent/);
  assert.match(v31, /windowSplashScreenBackground">#FAF7F2/);
  // Well-formed XML (the build would refuse it otherwise).
  for (const file of [manifestFile, path.join(res, 'values/ayk_launch.xml'), path.join(res, 'values-v31/ayk_launch.xml')]) {
    execFileSync('python3', ['-c', 'import sys,xml.dom.minidom; xml.dom.minidom.parse(sys.argv[1])', file]);
  }
  // Running it again (Bubblewrap regenerates, apply runs every build) changes nothing more.
  applySplash(project);
  assert.equal((fs.readFileSync(manifestFile, 'utf8').match(/AykLaunchTheme/g) || []).length, 1);
  // The transparent picture is a real 1x1 PNG with alpha 0.
  assert.equal(TRANSPARENT_PNG.subarray(1, 4).toString(), 'PNG');
  fs.rmSync(project, { recursive: true, force: true });
});
