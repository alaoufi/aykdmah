# مصدر بيانات أحياء القصيم والمجمعة

البيانات مستخرجة من [Homaily / Saudi Arabia Regions, Cities and Districts](https://github.com/homaily/Saudi-Arabia-Regions-Cities-and-Districts/tree/7e322945fa9f6d696a54ba3e9038e0e750e9692d)، إصدار commit `7e322945fa9f6d696a54ba3e9038e0e750e9692d` بتاريخ 11 يناير 2022. ينسب وصف المصدر تجميعه إلى خرائط العنوان الوطني؛ ليست هذه شهادة بأن البيانات تشمل جميع الأحياء المستحدثة.

تراخيص ملف البيانات `qassim-majmaah.json` والجزء المشتق منه في الترحيل `031_qassim_majmaah_districts.sql`: **GPL-2.0**، مع نص الرخصة المرفق في `LICENSE-GPL-2.0.txt`. تحتفظ بقية ملفات التطبيق بتراخيصها الخاصة. التعديلات على البيانات: استخراج القصيم ومدينة المجمعة فقط، حذف بادئة «حي» من أسماء القوائم، دمج صفّي «حي اليرموك» بعنيزة مع حفظ معرفي المصدر، وتوحيد إملاء «الأسياح».

التغطية: 17 مدينة بالقصيم ومدينة المجمعة، 386 اسم حي فريدًا (373 في القصيم و13 في المجمعة). المصدر يحوي 426 اسم مدينة/قرية بالقصيم؛ 17 منها فقط لها أحياء في هذه المجموعة. إحداثيات الأحياء غير متوفرة في ملفات lite، لذلك لم تُستنتج ولم تُنسخ من مركز المدينة.

المحافظات الـ14 المتطابقة رُبطت بمدنها دون تغيير معرّفات المدن القديمة. قبة والخبراء والهلالية والمرموثة مرتبطة بمنطقة القصيم دون محافظة، لأن المصدر لا يعطي علاقة المحافظات. تظهر ضمن المدن عند اختيار المنطقة وترك المحافظة فارغة. يُنشئ PostgreSQL معرفات المدن والأحياء؛ لا تستخدم معرفات المصدر كمعرفات للتطبيق.

الترحيل إضافي ومسجّل في سجل الترحيلات، ويحافظ على الأسماء والحالات المعدّلة لاحقًا من الإدارة. لتوسعة الأحياء المستحدثة أضف سجلًا جديدًا من مصدر محدد بدل إسناد إحداثيات تخمينية.

---

# توسعة الأحياء لبقية مدن المملكة (الترحيل 046)

| الملف | المصدر | الترخيص | العدد |
|---|---|---|---|
| `homaily-districts.json` | Homaily، نفس الإصدار أعلاه (commit `7e322945`)، مستخرج من خرائط العنوان الوطني 2022. يحفظ `source_ref` معرف الحي في المصدر. | GPL-2.0 | 943 حيًا في 40 مدينة |
| `osm-districts.json` | OpenStreetMap عبر مستخرج Geofabrik لدول الخليج بتاريخ 2026-10-26: `place=suburb/neighbourhood/quarter` لها اسم عربي، وتقع داخل الحدود الرسمية للمملكة في OSM، وتُربط بأقرب مركز مدينة ضمن 40 كم. | ODbL — © OpenStreetMap contributors | 1,988 حيًا في 68 مدينة |

القواعد:
- المصدر الأول Homaily. لا يُستخدم OpenStreetMap إلا للمدن التي لا تغطيها قائمة Homaily (ومنها مدن القصيم والمجمعة المستوردة سابقًا).
- يُستبعد التكرار داخل المدينة بعد توحيد الإملاء: الحركات، أشكال الألف والياء والتاء المربوطة، وبادئة «حي».
- لا أسماء مخترعة ولا ترجمة آلية: استُبعدت 5,946 نقطة في OSM بلا اسم عربي.
- كل الأحياء المضافة `is_verified = 0`: لم تُطابق بعد مع خدمة العنوان الوطني الرسمية.
- المخرجات أعيد توليدها بالسكربتات `scripts/geo/homaily_districts.py` و`osm_districts.py` و`districts_sql.py`. علامة `` ` `` في بعض الأسماء الإنجليزية استُبدلت بـ «‘» لأن مترجم SQL يعاملها كاقتباس معرّفات.

إعادة التوليد (على خادم فيه Docker):
1. نزّل `gcc-states-latest.osm.pbf` من Geofabrik، ثم استخرج بـ osmium (حاوية debian:bookworm-slim مع `osmium-tool`):
   ```
   osmium tags-filter gcc.osm.pbf nwr/place=suburb,neighbourhood,quarter -o places.osm.pbf
   osmium export places.osm.pbf -f geojsonseq -o places.geojsonseq
   osmium tags-filter gcc.osm.pbf r/ISO3166-1=SA -o sa-boundary.osm.pbf
   osmium export sa-boundary.osm.pbf -f geojson -o sa-boundary.geojson --geometry-types=polygon
   ```
   ونزّل من Homaily (commit `7e322945`) الملفات `json/cities.json` و`json/districts_lite.json` و`json/regions_lite.json` بأسماء `hom_*.json`.
2. صدّر `cities.psv` و`regions.psv` و`existing.psv` من القاعدة، وشغّل `homaily_districts.py` ثم `osm_districts.py` ثم `districts_sql.py homaily districts-homaily.json openstreetmap districts-osm.json`.
3. أضف الناتج كترحيل جديد؛ لا تعدّل الترحيل 046 بعد تطبيقه.
