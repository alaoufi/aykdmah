// Adds the native call screen (AYK-068) to the Android project that Bubblewrap generates:
// the Java files, the texts (Arabic default, English), the permissions and the activity.
// Run after `bubblewrap update` (it regenerates the project): node apply.cjs <project dir>
const fs = require('fs');
const path = require('path');

const project = process.argv[2] || '/work';
const src = path.join(project, 'app/src/main');
const javaDir = path.join(src, 'java/sa/aykdmh/app');

// Every Java and Kotlin file here (the phone's own call engine is Kotlin, AYK-145).
for (const file of fs.readdirSync(__dirname).filter(name => /\.(java|kt)$/.test(name))) {
  fs.copyFileSync(path.join(__dirname, file), path.join(javaDir, file));
}

const strings = {
  values: { callChannelName: 'المكالمات الواردة', callAnswer: 'رد', callDecline: 'رفض', messageChannelName: 'الرسائل',
    callOngoing: 'مكالمة جارية', callTitle: 'مكالمة أي خدمة', callRinging: 'يرن…', callConnecting: 'جارٍ الاتصال…',
    callReconnecting: 'يعيد الاتصال…', callFailed: 'تعذر الاتصال', callEnded: 'انتهت المكالمة', callNeedsMic: 'المكالمة تحتاج إذن الميكروفون' },
  'values-en': { callChannelName: 'Incoming calls', callAnswer: 'Answer', callDecline: 'Decline', messageChannelName: 'Messages',
    callOngoing: 'Call in progress', callTitle: 'Ay Khidmah call', callRinging: 'Ringing…', callConnecting: 'Connecting…',
    callReconnecting: 'Reconnecting…', callFailed: 'Could not connect', callEnded: 'Call ended', callNeedsMic: 'The call needs the microphone' },
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
for (const permission of ['USE_FULL_SCREEN_INTENT', 'VIBRATE', 'WAKE_LOCK', 'RECORD_AUDIO', 'CAMERA', 'MODIFY_AUDIO_SETTINGS',
  'BLUETOOTH_CONNECT', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_PHONE_CALL', 'FOREGROUND_SERVICE_MICROPHONE',
  'FOREGROUND_SERVICE_CAMERA', 'MANAGE_OWN_CALLS']) {
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
// The phone's own call engine (AYK-145): the call screen (opened by the ring notification or by
// the site through aykdmhcall://call/<id>), the ongoing-call service, Android's call system and
// the "Decline" action.
if (!manifest.includes('.CallScreenActivity')) {
  manifest = manifest.replace('</application>', `    <activity android:name=".CallScreenActivity"
            android:exported="true"
            android:showWhenLocked="true"
            android:turnScreenOn="true"
            android:launchMode="singleTask"
            android:taskAffinity="sa.aykdmh.app.call"
            android:excludeFromRecents="false"
            android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize"
            android:theme="@android:style/Theme.Material.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="aykdmhcall" android:host="call" />
            </intent-filter>
        </activity>
        <service android:name=".CallOngoingService" android:exported="false"
            android:foregroundServiceType="phoneCall|microphone|camera" />
        <service android:name=".CallConnectionService" android:exported="true"
            android:permission="android.permission.BIND_TELECOM_CONNECTION_SERVICE">
            <intent-filter>
                <action android:name="android.telecom.ConnectionService" />
            </intent-filter>
        </service>
        <receiver android:name=".CallActionReceiver" android:exported="false" />
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
// Kotlin, for the call engine (AYK-145).
if (!root.includes('kotlin-gradle-plugin')) {
  root = root.replace(/(classpath 'com\.android\.tools\.build:gradle:[^']+')/, "$1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21'");
}
root = root.replace(/buildscript \{\s*repositories \{\s*google\(\)/, m => (m.includes('mavenCentral') ? m : `${m}\n        mavenCentral()`));
root = root.replace(/allprojects \{\s*repositories \{\s*google\(\)/, m => (m.includes('mavenCentral') ? m : `${m}\n        mavenCentral()`));
// LiveKit's audio routing library (audioswitch) is published on JitPack (AYK-145).
if (!root.includes('jitpack.io')) root = root.replace(/(allprojects \{\s*repositories \{)/, "$1\n        maven { url 'https://jitpack.io' }");
fs.writeFileSync(rootGradle, root);
const appGradle = path.join(project, 'app/build.gradle');
let app = fs.readFileSync(appGradle, 'utf8');
// The phone's own call engine (AYK-145): LiveKit's Android SDK (the same call server), Kotlin.
if (!app.includes('livekit-android')) {
  app = app.replace(/(id 'com\.android\.application')/, "$1\n    id 'kotlin-android'");
  // R8 keeps the call engine's WebRTC classes (reached through JNI).
  // No R8 shrinking: WebRTC is reached through JNI and R8 broke its classes; the app stays small anyway.
  app = app.replace(/(release \{\s*)minifyEnabled true/, '$1minifyEnabled false');
  fs.writeFileSync(path.join(project, 'app/proguard-livekit.pro'), [
    '-keep class org.webrtc.** { *; }', '-keep class livekit.** { *; }', '-keep class io.livekit.** { *; }',
    '-keep class com.twilio.audioswitch.** { *; }', '-dontwarn org.webrtc.**', '-dontwarn io.livekit.**',
    '-dontwarn livekit.**', '-dontwarn livekit.org.jni_zero.**', '',
  ].join('\n'));
  app = app.replace(/sourceCompatibility JavaVersion\.VERSION_1_8/, 'sourceCompatibility JavaVersion.VERSION_17')
    .replace(/targetCompatibility JavaVersion\.VERSION_1_8/, 'targetCompatibility JavaVersion.VERSION_17');
  app = app.replace(/(compileOptions \{[^}]*\})/, "$1\n    kotlinOptions {\n        jvmTarget = '17'\n    }\n    packagingOptions {\n        resources.excludes += ['META-INF/*.kotlin_module', 'META-INF/AL2.0', 'META-INF/LGPL2.1']\n    }");
  app = app.replace(/dependencies \{\n/, "dependencies {\n    implementation 'io.livekit:livekit-android:2.29.2'\n    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1'\n");
}
if (!app.includes('firebase-messaging')) {
  app = app.replace(/dependencies \{\n/, "dependencies {\n    implementation 'com.google.firebase:firebase-messaging:24.1.0'\n");
  app += "\napply plugin: 'com.google.gms.google-services'\n";
}
fs.writeFileSync(appGradle, app);
console.log('native call screen and Firebase added');
