# RIZA — منصة خدمات المنزل

المشروع المرفوع تطبيق ويب متجاوب وقابل للتثبيت (PWA)، مبني باستخدام React وVite، مع خادم Express وقاعدة بيانات PostgreSQL وSocket.IO. ليس مشروع React Native ولا يحتوي ملفات بناء آيفون أو أندرويد للمتاجر.

إعداد النشر الفعلي على Vercel وNeon موثق في [VERCEL_NEON.md](VERCEL_NEON.md). هذه النسخة تضيف حفظ المرفقات في PostgreSQL وتحديث HTTP للمحادثات وتتبع الموقع.

المراجعة الأصلية والفحوص موثقة في [REVIEW.md](REVIEW.md).

## التشغيل المحلي

المتطلبات: Node.js 22.12 أو أحدث، npm، وPostgreSQL 14 أو أحدث. الخادم الحالي لا يستخدم MySQL؛ ملفات SQL القديمة تُحوّل إلى PostgreSQL بواسطة معالج التثبيت.

```bash
npm run install:all
cp .env.example .env
```

عدّل `.env` للتطوير:

```dotenv
NODE_ENV=development
APP_NAME=RIZA
APP_URL=http://localhost:5173
CLIENT_URL=http://localhost:5173
APP_PORT=5000
DATABASE_URL=
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ryza
DB_USER=ryza_app
DB_PASSWORD=كلمة_مرور_قاعدة_بياناتك
DB_SSL=false
UPLOAD_DIR=
```

أنشئ قاعدة `ryza` ومستخدم `ryza_app` بصلاحية إنشاء الجداول داخلها. لا تعِد استخدام قاعدة بيانات إنتاج لاختبارات المشروع.

استبدل قيمة `JWT_SECRET` بسر عشوائي خاص بالمشروع. لتوليده وحفظه مباشرة دون طباعته:

```bash
node -e 'const fs=require("fs"),c=require("crypto");const p=".env";fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/^JWT_SECRET=.*$/m,"JWT_SECRET="+c.randomBytes(48).toString("hex")))'
npm run dev
```

تهيئة قاعدة البيانات وإنشاء المدير تتم عبر أمر `npm run seed` التالي. مسارات `/install` و`/api/setup/*` معطلة في جميع البيئات.

## الإعداد دون معالج الويب

يمكن تشغيل `npm run seed` بعد ضبط الاتصال. عند عدم وجود مدير يجب أن تحدد في `.env`:

```dotenv
BOOTSTRAP_ADMIN_EMAIL=your-admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=كلمة_مرور_تختارها_من_12_حرفا_أو_أكثر
BOOTSTRAP_ADMIN_NAME=مدير RIZA
```

الأمر يحافظ على بيانات المدير الموجود، ولا يعيد تعيين كلمات المرور. احذف قيم `BOOTSTRAP_ADMIN_*` من البيئة بعد إنشاء الحساب.

## الوظائف والفحوص

التسجيل يقبل وسيلة تعريف مفعلة واحدة على الأقل، مع كلمة مرور. طلب العميل يُحفظ في قاعدة البيانات؛ العامل يقدم عرضًا؛ العميل يقبله فتُنشأ محادثة بينهما، ويمكن تحديث حالة الخدمة. نموذج «اطلب الخدمة» في الكتالوج يرسل طلبًا فعليًا ويعرض النجاح بعد تأكيد الخادم فقط.

```bash
npm test
npm run i18n:check
npm run build
```

اختبارات التكامل تحتاج قاعدة محلية منفصلة يبدأ اسمها بـ `ryza_test`. الاتصال الاختباري مخصص للمضيف المحلي والمستخدم `postgres`؛ المثال المستخدم أثناء المراجعة:

```bash
RYZA_TEST_DB=ryza_test_flow RYZA_TEST_PORT=55432 npm run test:integration
```

اختبارات التكامل تنشئ مستخدمين وطلبات داخل قاعدة الاختبار؛ بدون `RYZA_TEST_DB` تُتخطى بوضوح. لا تُشغّلها على بيانات مستخدمين حقيقيين.

## حالة نسخة Vercel

- التسجيل والطلبات والعروض والمحادثات والمرفقات مرتبطة بقاعدة PostgreSQL، دون بيانات localStorage تجريبية.
- نطاق الإطلاق القصيم والمجمعة، وباقة العامل 40 ريالًا مع تجربة مجانية. الدفع الإلكتروني متوقف حتى تنفيذ بوابة فعلية.
- بيانات بطاقات الخدمة أنواع وأسعار استرشادية؛ العامل والسعر الفعليان يحددهما العرض المقبول.
- يبقى هذا المشروع PWA؛ نشر آيفون وأندرويد في المتاجر يحتاج مشروع الجوال وإعدادات المتاجر.

