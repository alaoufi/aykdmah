import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArabic, parseIntent, understandRequest, sameRoot } from '../src/utils/requestIntent.mjs';

// AYK-419: the demo catalogue (professions and services as the site lists them).
const categories = [{"id": 1, "slug": "home-maintenance", "name_ar": "صيانة منزلية", "name_en": "Home maintenance"}, {"id": 2, "slug": "cleaning", "name_ar": "نظافة", "name_en": "Cleaning"}, {"id": 3, "slug": "moving", "name_ar": "نقل وعفش", "name_en": "Moving"}, {"id": 4, "slug": "electrical", "name_ar": "كهرباء", "name_en": "Electrical"}, {"id": 5, "slug": "plumbing", "name_ar": "سباكة", "name_en": "Plumbing"}, {"id": 6, "slug": "ac-cooling", "name_ar": "تكييف وتبريد", "name_en": "AC & cooling"}, {"id": 7, "slug": "paint-decor", "name_ar": "دهانات وديكور", "name_en": "Paint & décor"}, {"id": 8, "slug": "gardens", "name_ar": "حدائق ومناظر", "name_en": "Gardens & landscaping"}];
const services = [{"id": 11, "category_id": 4, "name_ar": "إصلاح أعطال كهربائية", "name_en": "Electrical repair"}, {"id": 13, "category_id": 5, "name_ar": "إصلاح تسربات", "name_en": "Leak repair"}, {"id": 19, "category_id": 8, "name_ar": "تنسيق حدائق", "name_en": "Garden landscaping"}, {"id": 4, "category_id": 2, "name_ar": "تنظيف منازل", "name_en": "Home cleaning"}, {"id": 17, "category_id": 7, "name_ar": "دهان منازل", "name_en": "Home painting"}, {"id": 1, "category_id": 1, "name_ar": "صيانة عامة", "name_en": "General maintenance"}, {"id": 15, "category_id": 6, "name_ar": "صيانة مكيفات سبليت", "name_en": "Split AC service"}, {"id": 8, "category_id": 3, "name_ar": "نقل عفش داخل المدينة", "name_en": "Moving in city"}, {"id": 30, "category_id": 8, "name_ar": "العناية بالعشب", "name_en": "Lawn care"}, {"id": 2, "category_id": 1, "name_ar": "تركيب أثاث", "name_en": "Furniture installation"}, {"id": 14, "category_id": 5, "name_ar": "تسليك مجاري", "name_en": "Drain cleaning"}, {"id": 12, "category_id": 4, "name_ar": "تمديدات كهربائية", "name_en": "Electrical wiring"}, {"id": 5, "category_id": 2, "name_ar": "تنظيف خزانات", "name_en": "Water tank cleaning"}, {"id": 16, "category_id": 6, "name_ar": "صيانة مكيفات مركزية", "name_en": "Central AC service"}, {"id": 9, "category_id": 3, "name_ar": "نقل عفش بين المدن", "name_en": "Moving between cities"}, {"id": 18, "category_id": 7, "name_ar": "ورق جدران", "name_en": "Wallpaper"}, {"id": 3, "category_id": 1, "name_ar": "إصلاح أبواب ونوافذ", "name_en": "Door & window repair"}, {"id": 26, "category_id": 4, "name_ar": "تركيب إنارة", "name_en": "Lighting installation"}, {"id": 27, "category_id": 5, "name_ar": "تركيب سخانات", "name_en": "Heater installation"}, {"id": 28, "category_id": 6, "name_ar": "تركيب مكيفات", "name_en": "AC installation"}, {"id": 6, "category_id": 2, "name_ar": "تنظيف مكيفات", "name_en": "AC cleaning"}, {"id": 29, "category_id": 7, "name_ar": "ديكور جبس", "name_en": "Gypsum decor"}, {"id": 10, "category_id": 3, "name_ar": "فك وتركيب أثاث", "name_en": "Furniture assembly"}, {"id": 24, "category_id": 1, "name_ar": "تركيب ستائر", "name_en": "Curtain installation"}, {"id": 3001, "category_id": 2, "name_ar": "غسيل الأحواش", "name_en": "Yard cleaning"}, {"id": 7, "category_id": 2, "name_ar": "مكافحة حشرات", "name_en": "Pest control"}, {"id": 25, "category_id": 2, "name_ar": "غسيل سجاد", "name_en": "Carpet cleaning"}];
const CASES = [["مكيفي ما يبرد وصوته عالي", "ac-cooling", null], ["أبي سباك اليوم في حي النرجس، فيه تهريب تحت المغسلة", "plumbing", "إصلاح تسربات"], ["تركيب ثلاث إنارات في المجلس", "electrical", "تركيب إنارة"], ["نقل عفش شقة غرفتين من الملز للنرجس بكرة الصبح", "moving", null], ["تنظيف فلة قبل العيد ضروري", "cleaning", null], ["القاطع يفصل كل ما شغلت الفرن", "electrical", "إصلاح أعطال كهربائية"], ["أبي أحد يدهن غرفة النوم بحدود 500", "paint-decor", "دهان منازل"], ["المجاري مسدودة في الحمام", "plumbing", "تسليك مجاري"], ["ابغى غسيل سجاد ٣ قطع", "cleaning", "غسيل سجاد"], ["فيه صراصير في المطبخ", "cleaning", "مكافحة حشرات"], ["باب الغرفة ما يقفل", "home-maintenance", "إصلاح أبواب ونوافذ"], ["ابي اركب ستاير للصالة", "home-maintenance", "تركيب ستائر"], ["قص العشب وتنسيق الحديقة", "gardens", null], ["تركيب سخان جديد", "plumbing", "تركيب سخانات"]];

test('normalizes Arabic spelling and digits', () => {
  assert.equal(normalizeArabic('أُريدُ إنارةً ٣'), 'اريد انارة 3'.replace('ة', 'ه'));
  assert.ok(sameRoot('مكيفي', 'مكيفات'));
  assert.ok(sameRoot('والمكيف', 'مكيف'));
});

test('reads count, budget, time and urgency', () => {
  const a = parseIntent('أبي أحد يدهن غرفة النوم بحدود 500 بكرة');
  assert.equal(a.budget, 500); assert.equal(a.when, 'tomorrow');
  const b = parseIntent('تركيب ثلاث إنارات ضروري اليوم');
  assert.equal(b.count, 3); assert.equal(b.urgent, true); assert.equal(b.when, 'today');
  assert.equal(parseIntent('غسيل سجاد ٣ قطع').count, 3);
  // From «أكلات جدتنا» (server-edge #29): Arabic-Indic digits survive removing the diacritics.
  const c = parseIntent('أبي ٣ كيلو بميزانية ٢٥٠');
  assert.equal(c.count, 3); assert.equal(c.budget, 250);
});

test('everyday sentences find the right profession and service', () => {
  for (const [text, slug, service] of CASES) {
    const r = understandRequest(text, { categories, services });
    assert.equal(r.category?.slug, slug, `profession for «${text}»`);
    if (service) assert.equal(r.service?.name_ar, service, `service for «${text}»`);
    assert.ok(r.title.length > 3 && r.title.length <= 80);
  }
});

test('nothing understood: no guess', () => {
  const r = understandRequest('مرحبا كيف الحال', { categories, services });
  assert.equal(r.category, null); assert.equal(r.confidence, 0);
});
