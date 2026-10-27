# بنية المشروع

```
المتصفح (React/Vite PWA، عربي RTL + 4 لغات)
   │ HTTPS
   ▼
Caddy (aykdmh-web) ── ملفات الواجهة الثابتة من /var/www/aykdmh/current
   ├── /api/*  و /socket.io/*  ──► Node 22 / Express (aykdmh-app) ──► PostgreSQL 16 (aykdmh-db)
   └── /livekit/*  ──► LiveKit (aykdmh-livekit)  ◄── وسائط WebRTC: 7882/udp، 7881/tcp، TURN 3478/udp
```

## المجلدات

| المسار | المحتوى |
|---|---|
| `client/src/pages` | الصفحات. لوحة المقدم في `provider/`، والإدارة في `admin/` |
| `client/src/components/map/BaseTileLayer.jsx` | طبقة البلاط المشتركة لكل الخرائط |
| `client/src/context/CallContext.jsx` و`components/calls/` | حالة المكالمة وشاشتها وأزرارها |
| `client/src/i18n/locales/*.json` | نصوص اللغات الخمس (يجب تطابق المفاتيح) |
| `server/routes` و`controllers` و`services` و`models` | الـ API. الخدمات الجديدة: `callService` و`walletService` و`nominatimClient` |
| `server/tests` | اختبارات الوحدات `*.test.js` والتكامل `*.integration.js` |
| `database/migrations` | الترحيلات بلهجة MySQL، تُترجم إلى PostgreSQL عند التشغيل |
| `database/postgres/RUN-ME.sql` | تثبيت كامل لقاعدة جديدة (يُحدَّث بـ `scripts/append-pg-migrations.cjs`) |
| `database/geography` و`scripts/geo` | مصادر الأحياء وسكربتات توليدها |
| `deploy/` | Compose وCaddy وLiveKit وسكربتات النشر والاختبار |
| `e2e/calls.e2e.mjs` | اختبار مكالمة حقيقية بمتصفحين |

## الخرائط والموقع

- كل الخرائط Leaflet. البلاط متجهي من OpenFreeMap يرسمه MapLibre داخل Leaflet (`BaseTileLayer`)، ويُحمَّل عند فتح الخريطة فقط.
- البحث عن العناوين والإحداثيات العكسية عبر الخادم (`/api/geo/search` و`/api/geo/reverse`) إلى Nominatim، بطابور 1 طلب/ثانية وتخزين مؤقت.
- `/api/providers/nearby`: الموقع الدقيق لمقدم الخدمة لا يظهر إلا إن فعّل `show_location_on_map`، وإلا فمركز مدينته.

## المكالمات

- الصلاحية = صلاحية المراسلة: `Conversation.canSend` للطرفين في محادثة طلب صالحة.
- غرفة عشوائية لكل مكالمة، بحد أقصى مشاركين اثنين. رمز دخول مدته 15 دقيقة من الخادم فقط. لا تسجيل ولا قنوات بيانات.
- الحالات: `ringing` ثم `accepted` ثم إحدى النهايات `ended` أو `rejected` أو `cancelled` أو `missed` أو `failed`. مهلة الرنين 45 ثانية، وWebhook موقّع من LiveKit لإنهاء المكالمات المنقطعة.
- الإشعارات الفورية عبر Socket.IO على غرفة `user:<id>`، مع استقصاء احتياطي.

## الكوبونات والمحفظة

- لكل مقدم خدمة `users.referral_code` فريد. والمسجل الجديد يُربط بـ `users.referred_by`.
- الرصيد = مجموع `wallet_transactions` غير الملغاة، ولا يُخزَّن رقمًا مستقلًا. كل خصم يقفل صف المستخدم.
- العمولة تُحسب داخل `Payment.settleVerified` عند اكتمال **أول** دفعة بوابة، وتُسجّل في `referral_rewards` بقيد فريد.
- السحب طلب يُحجز فيه المبلغ حتى تعتمده الإدارة. والدفع لآخر يُسجَّل دفعة `provider='wallet'` لا تنتج عمولة.
