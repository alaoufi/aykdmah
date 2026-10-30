// Adds the native call screen (AYK-068) to the Android project that Bubblewrap generates:
// the Java files, the texts (Arabic default, English), the permissions and the activity.
// Run after `bubblewrap update` (it regenerates the project): node apply.cjs <project dir>
const fs = require('fs');
const path = require('path');

const project = process.argv[2] || '/work';
const src = path.join(project, 'app/src/main');
const javaDir = path.join(src, 'java/sa/aykdmh/app');

for (const file of ['DelegationService.java', 'CallAlert.java', 'CallActivity.java']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(javaDir, file));
}

const strings = {
  values: { callChannelName: 'المكالمات الواردة', callAnswer: 'رد', callDecline: 'رفض' },
  'values-en': { callChannelName: 'Incoming calls', callAnswer: 'Answer', callDecline: 'Decline' },
};
for (const [dir, entries] of Object.entries(strings)) {
  const file = path.join(src, 'res', dir, 'strings.xml');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let xml = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
  for (const [name, value] of Object.entries(entries)) {
    if (!xml.includes(`name="${name}"`)) xml = xml.replace('</resources>', `    <string name="${name}">${value}</string>\n</resources>`);
  }
  fs.writeFileSync(file, xml);
}

const manifestFile = path.join(src, 'AndroidManifest.xml');
let manifest = fs.readFileSync(manifestFile, 'utf8');
for (const permission of ['USE_FULL_SCREEN_INTENT', 'VIBRATE', 'WAKE_LOCK']) {
  const line = `<uses-permission android:name="android.permission.${permission}"/>`;
  if (!manifest.includes(line)) manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n    ${line}`);
}
if (!manifest.includes('.CallActivity')) {
  manifest = manifest.replace('</application>', `    <activity android:name=".CallActivity"
            android:exported="false"
            android:showWhenLocked="true"
            android:turnScreenOn="true"
            android:launchMode="singleInstance"
            android:excludeFromRecents="true"
            android:taskAffinity=""
            android:theme="@android:style/Theme.Material.NoActionBar.Fullscreen" />
    </application>`);
}
fs.writeFileSync(manifestFile, manifest);
console.log('native call screen added');
