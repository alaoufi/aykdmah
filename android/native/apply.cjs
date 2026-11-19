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

// The native call screen and notifications in the app's 11 languages (AYK-308). Android picks the
// folder from the phone's language: values (Arabic, the default), values-en, … Filipino is under both
// values-fil and values-tl, Indonesian under values-in (Android's code for it).
const strings = {
  'values': { callChannelName: 'المكالمات الواردة', callAnswer: 'رد', callDecline: 'رفض', messageChannelName: 'الرسائل', callOngoing: 'مكالمة جارية', callTitle: 'مكالمة أي خدمة', callRinging: 'يرن…', callConnecting: 'جارٍ الاتصال…', callReconnecting: 'يعيد الاتصال…', callFailed: 'تعذر الاتصال', callEnded: 'انتهت المكالمة', callNeedsMic: 'المكالمة تحتاج إذن الميكروفون' },
  'values-en': { callChannelName: 'Incoming calls', callAnswer: 'Answer', callDecline: 'Decline', messageChannelName: 'Messages', callOngoing: 'Call in progress', callTitle: 'Ay Khidma call', callRinging: 'Ringing…', callConnecting: 'Connecting…', callReconnecting: 'Reconnecting…', callFailed: 'Could not connect', callEnded: 'Call ended', callNeedsMic: 'The call needs microphone permission' },
  'values-ur': { callChannelName: 'آنے والی کالیں', callAnswer: 'جواب دیں', callDecline: 'مسترد کریں', messageChannelName: 'پیغامات', callOngoing: 'کال جاری ہے', callTitle: 'Ay Khidma کال', callRinging: 'گھنٹی بج رہی ہے…', callConnecting: 'رابطہ ہو رہا ہے…', callReconnecting: 'دوبارہ رابطہ ہو رہا ہے…', callFailed: 'رابطہ نہیں ہو سکا', callEnded: 'کال ختم ہو گئی', callNeedsMic: 'کال کے لیے مائیکروفون کی اجازت درکار ہے' },
  'values-hi': { callChannelName: 'आने वाली कॉल', callAnswer: 'जवाब दें', callDecline: 'अस्वीकार करें', messageChannelName: 'संदेश', callOngoing: 'कॉल जारी है', callTitle: 'Ay Khidma कॉल', callRinging: 'घंटी बज रही है…', callConnecting: 'कनेक्ट हो रहा है…', callReconnecting: 'फिर से कनेक्ट हो रहा है…', callFailed: 'कनेक्ट नहीं हो सका', callEnded: 'कॉल खत्म हुई', callNeedsMic: 'कॉल के लिए माइक्रोफ़ोन की अनुमति चाहिए' },
  'values-bn': { callChannelName: 'ইনকামিং কল', callAnswer: 'উত্তর দিন', callDecline: 'প্রত্যাখ্যান করুন', messageChannelName: 'বার্তা', callOngoing: 'কল চলছে', callTitle: 'Ay Khidma কল', callRinging: 'রিং হচ্ছে…', callConnecting: 'সংযোগ হচ্ছে…', callReconnecting: 'আবার সংযোগ হচ্ছে…', callFailed: 'সংযোগ করা যায়নি', callEnded: 'কল শেষ হয়েছে', callNeedsMic: 'কলের জন্য মাইক্রোফোনের অনুমতি দরকার' },
  'values-ml': { callChannelName: 'ഇൻകമിംഗ് കോളുകൾ', callAnswer: 'സ്വീകരിക്കുക', callDecline: 'നിരസിക്കുക', messageChannelName: 'സന്ദേശങ്ങൾ', callOngoing: 'കോൾ നടക്കുന്നു', callTitle: 'Ay Khidma കോൾ', callRinging: 'റിംഗ് ചെയ്യുന്നു…', callConnecting: 'കണക്റ്റ് ചെയ്യുന്നു…', callReconnecting: 'വീണ്ടും കണക്റ്റ് ചെയ്യുന്നു…', callFailed: 'കണക്റ്റ് ചെയ്യാനായില്ല', callEnded: 'കോൾ അവസാനിച്ചു', callNeedsMic: 'കോളിന് മൈക്രോഫോൺ അനുമതി വേണം' },
  'values-fil': { callChannelName: 'Mga papasok na tawag', callAnswer: 'Sagutin', callDecline: 'Tanggihan', messageChannelName: 'Mga mensahe', callOngoing: 'Kasalukuyang tawag', callTitle: 'Tawag sa Ay Khidma', callRinging: 'Nagri-ring…', callConnecting: 'Kumokonekta…', callReconnecting: 'Muling kumokonekta…', callFailed: 'Hindi makakonekta', callEnded: 'Natapos ang tawag', callNeedsMic: 'Kailangan ng tawag ang pahintulot sa mikropono' },
  'values-in': { callChannelName: 'Panggilan masuk', callAnswer: 'Jawab', callDecline: 'Tolak', messageChannelName: 'Pesan', callOngoing: 'Panggilan berlangsung', callTitle: 'Panggilan Ay Khidma', callRinging: 'Berdering…', callConnecting: 'Menghubungkan…', callReconnecting: 'Menghubungkan ulang…', callFailed: 'Tidak dapat terhubung', callEnded: 'Panggilan berakhir', callNeedsMic: 'Panggilan memerlukan izin mikrofon' },
  'values-ne': { callChannelName: 'आउने कलहरू', callAnswer: 'उठाउनुहोस्', callDecline: 'अस्वीकार गर्नुहोस्', messageChannelName: 'सन्देशहरू', callOngoing: 'कल जारी छ', callTitle: 'Ay Khidma कल', callRinging: 'घण्टी बज्दैछ…', callConnecting: 'जडान हुँदैछ…', callReconnecting: 'फेरि जडान हुँदैछ…', callFailed: 'जडान हुन सकेन', callEnded: 'कल सकियो', callNeedsMic: 'कलका लागि माइक्रोफोन अनुमति चाहिन्छ' },
  'values-am': { callChannelName: 'ገቢ ጥሪዎች', callAnswer: 'መልስ', callDecline: 'ውድቅ አድርግ', messageChannelName: 'መልዕክቶች', callOngoing: 'ጥሪ በሂደት ላይ', callTitle: 'የAy Khidma ጥሪ', callRinging: 'እየጠራ ነው…', callConnecting: 'በመገናኘት ላይ…', callReconnecting: 'እንደገና በመገናኘት ላይ…', callFailed: 'መገናኘት አልተቻለም', callEnded: 'ጥሪው አብቅቷል', callNeedsMic: 'ጥሪው የማይክሮፎን ፈቃድ ያስፈልገዋል' },
  'values-tr': { callChannelName: 'Gelen aramalar', callAnswer: 'Yanıtla', callDecline: 'Reddet', messageChannelName: 'Mesajlar', callOngoing: 'Arama sürüyor', callTitle: 'Ay Khidma araması', callRinging: 'Çalıyor…', callConnecting: 'Bağlanıyor…', callReconnecting: 'Yeniden bağlanıyor…', callFailed: 'Bağlanılamadı', callEnded: 'Arama sona erdi', callNeedsMic: 'Arama için mikrofon izni gerekiyor' },
  'values-tl': { callChannelName: 'Mga papasok na tawag', callAnswer: 'Sagutin', callDecline: 'Tanggihan', messageChannelName: 'Mga mensahe', callOngoing: 'Kasalukuyang tawag', callTitle: 'Tawag sa Ay Khidma', callRinging: 'Nagri-ring…', callConnecting: 'Kumokonekta…', callReconnecting: 'Muling kumokonekta…', callFailed: 'Hindi makakonekta', callEnded: 'Natapos ang tawag', callNeedsMic: 'Kailangan ng tawag ang pahintulot sa mikropono' },
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
manifest = require('./manifest-permissions.cjs')(manifest);
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
// The opening screen without the logo (AYK-276).
console.log(`opening screen without logo (${require('./splash.cjs').applySplash(project)} splash images cleared)`);

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
// Required updates from Google Play (AYK-148): Play's In-App Updates, in LauncherActivity.
if (!app.includes('com.google.android.play:app-update')) {
  app = app.replace(/dependencies \{\n/, "dependencies {\n    implementation 'com.google.android.play:app-update:2.1.0'\n");
}
if (!app.includes('firebase-messaging')) {
  app = app.replace(/dependencies \{\n/, "dependencies {\n    implementation 'com.google.firebase:firebase-messaging:24.1.0'\n");
  app += "\napply plugin: 'com.google.gms.google-services'\n";
}
fs.writeFileSync(appGradle, app);
console.log('native call screen and Firebase added');
