// The opening screen without the logo (AYK-276, the owner's decision): when the app opens, a plain
// screen in the site's background colour (#FAF7F2), then the site, which now paints that same
// colour at once. Two screens are involved:
// 1. Bubblewrap's own splash (LauncherActivity shows res/drawable-*/splash.png on the background
//    colour until the site is ready): the picture becomes a transparent pixel.
// 2. Android 12+ draws its own starting screen with the app icon: on the launcher activity's theme
//    the icon is made transparent and the background set to the same colour.
const fs = require('fs');
const path = require('path');

const TRANSPARENT_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGBgAAAABQABeqhXUAAAAABJRU5ErkJggg==', 'base64');
const BACKGROUND = '#FAF7F2';

function applySplash(project) {
  const res = path.join(project, 'app/src/main/res');
  let replaced = 0;
  for (const dir of fs.readdirSync(res).filter(name => /^drawable(-[a-z0-9]+)*$/.test(name))) {
    const file = path.join(res, dir, 'splash.png');
    if (fs.existsSync(file)) { fs.writeFileSync(file, TRANSPARENT_PNG); replaced += 1; }
  }
  const manifestFile = path.join(project, 'app/src/main/AndroidManifest.xml');
  let manifest = fs.readFileSync(manifestFile, 'utf8');
  const appTheme = /<application\b[^>]*\bandroid:theme="([^"]+)"/.exec(manifest)?.[1] || '@android:style/Theme.Translucent.NoTitleBar';
  const write = (dir, body) => {
    fs.mkdirSync(path.join(res, dir), { recursive: true });
    fs.writeFileSync(path.join(res, dir, 'ayk_launch.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${body}</resources>\n`);
  };
  // Same as the app's theme everywhere; on Android 12+ also no icon on the starting screen.
  write('values', `    <style name="AykLaunchTheme" parent="${appTheme}" />\n`);
  write('values-v31', `    <style name="AykLaunchTheme" parent="${appTheme}">
        <item name="android:windowSplashScreenAnimatedIcon">@android:color/transparent</item>
        <item name="android:windowSplashScreenBackground">${BACKGROUND}</item>
    </style>\n`);
  manifest = manifest.replace(/<activity(\s+)android:name="LauncherActivity"(?![^>]*android:theme=)/,
    (match, space) => `<activity${space}android:name="LauncherActivity" android:theme="@style/AykLaunchTheme"`);
  if (!/android:name="LauncherActivity"[^>]*android:theme="@style\/AykLaunchTheme"/.test(manifest)) throw new Error('LauncherActivity not found for the opening screen');
  fs.writeFileSync(manifestFile, manifest);
  return replaced;
}

module.exports = { applySplash, TRANSPARENT_PNG, BACKGROUND };
