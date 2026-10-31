// Adds the native call screen (AYK-068) to the Android project that Bubblewrap generates:
// the Java files, the texts (Arabic default, English), the permissions and the activity.
// Run after `bubblewrap update` (it regenerates the project): node apply.cjs <project dir>
const fs = require('fs');
const path = require('path');

const project = process.argv[2] || '/work';
const src = path.join(project, 'app/src/main');
const javaDir = path.join(src, 'java/sa/aykdmh/app');

for (const file of ['DelegationService.java', 'CallAlert.java', 'CallActivity.java', 'FcmService.java', 'LauncherActivity.java', 'MessageAlert.java']) {
  fs.copyFileSync(path.join(__dirname, file), path.join(javaDir, file));
}

const strings = {
  values: { callChannelName: 'المكالمات الواردة', callAnswer: 'رد', callDecline: 'رفض', messageChannelName: 'الرسائل' },
  'values-en': { callChannelName: 'Incoming calls', callAnswer: 'Answer', callDecline: 'Decline', messageChannelName: 'Messages' },
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
// Firebase Cloud Messaging (AYK-094): calls ring the app itself even when it is closed. The
// google-services.json comes from the server's keys folder, never from the repository.
if (!manifest.includes('.FcmService')) {
  manifest = manifest.replace('</application>', `    <service android:name=".FcmService" android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
    </application>`);
}
const notifyLine = '<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>';
if (!manifest.includes('POST_NOTIFICATIONS')) manifest = manifest.replace(/(<manifest[^>]*>)/, `$1\n    ${notifyLine}`);
fs.writeFileSync(manifestFile, manifest);

const keys = process.env.KEYS_DIR || '/keys';
fs.copyFileSync(path.join(keys, 'google-services.json'), path.join(project, 'app/google-services.json'));
const rootGradle = path.join(project, 'build.gradle');
let root = fs.readFileSync(rootGradle, 'utf8');
if (!root.includes('google-services')) {
  root = root.replace(/(classpath 'com\.android\.tools\.build:gradle:[^']+')/, "$1\n        classpath 'com.google.gms:google-services:4.4.2'");
}
root = root.replace(/allprojects \{\s*repositories \{\s*google\(\)/, m => (m.includes('mavenCentral') ? m : `${m}\n        mavenCentral()`));
fs.writeFileSync(rootGradle, root);
const appGradle = path.join(project, 'app/build.gradle');
let app = fs.readFileSync(appGradle, 'utf8');
if (!app.includes('firebase-messaging')) {
  app = app.replace(/dependencies \{\n/, "dependencies {\n    implementation 'com.google.firebase:firebase-messaging:24.1.0'\n");
  app += "\napply plugin: 'com.google.gms.google-services'\n";
}
fs.writeFileSync(appGradle, app);
console.log('native call screen and Firebase added');
