# إعداد الخادم

> لا كلمات مرور ولا مفاتيح في هذا الملف.

| البند | القيمة |
|---|---|
| المزود | Contabo Cloud VPS 8 (`vmi3696890`)، منطقة EU |
| العنوان | `84.247.166.216`. يشير إليه `aykdmh.com` و`www` (DNS لدى dns-parking.com) |
| النظام | Ubuntu 24.04، 8 أنوية، 23GB ذاكرة، 290GB قرص |
| الدخول | SSH بمفتاح (`root`). الدخول بكلمة المرور ما زال مفعّلًا (AYK-020) |
| Docker | الحاويات أدناه + Coolify 4.5.0 مثبت سابقًا وغير مستخدم (لا تعدّله) |

## الحاويات (`docker compose -p aykdmh`)

| الحاوية | الصورة | المنافذ العامة |
|---|---|---|
| `aykdmh-web` | `caddy:2.8.4-alpine` | 80، 443/tcp، 443/udp |
| `aykdmh-app` | `aykdmh-app:latest` (`deploy/app.Dockerfile`) | لا شيء |
| `aykdmh-db` | `postgres:16-alpine` | لا شيء |
| `aykdmh-livekit` | `livekit/livekit-server:v1.13.9` | 7881/tcp، 7882/udp، 3478/udp |

## الجدار الناري (UFW)

مفتوح: 22/tcp، و80/tcp، و443/tcp و443/udp، و7881/tcp، و7882/udp، و3478/udp. الباقي مغلق. نسخة من القواعد قبل كل نشر في `/root/backups/ufw-*.tgz`.

## المسارات

| المسار | المحتوى |
|---|---|
| `/opt/aykdmh` | نسخة المستودع المنشورة (فرع `claude/deploy-setup`) |
| `/opt/aykdmh/.env` | الأسرار (صلاحية 600): `DB_PASSWORD` و`JWT_SECRET` و`ENCRYPTION_KEY` و`LIVEKIT_API_SECRET` |
| `/var/www/aykdmh/releases` و`current` | إصدارات الواجهة والإصدار الفعّال |
| `/root/backups` | نسخ القاعدة وUFW وسجل آخر نشر |
| `/root/aykdmh-admin-credentials.txt` | بيانات أول دخول للإدارة. تُحذف بعد تغيير كلمة المرور |

## متغيرات البيئة غير السرية (في `deploy/docker-compose.yml`)

`APP_URL=https://aykdmh.com` و`TRUST_PROXY=1` و`LIVEKIT_URL=wss://aykdmh.com/livekit` و`LIVEKIT_API_URL=http://livekit:7880` و`LIVEKIT_API_KEY=aykdmh`، وبيانات اتصال القاعدة الداخلية.

## الخدمات الخارجية المجانية

OpenFreeMap (بلاط الخرائط)، وOpenStreetMap Nominatim (العناوين)، وLet's Encrypt (الشهادات)، وGeofabrik (مستخرجات الأحياء عند إعادة التوليد).
