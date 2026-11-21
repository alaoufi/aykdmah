// AYK-419 (the owner: «ابدأ بالرقم 1… العربي»): the requester writes the request in their own
// words («مكيفي ما يبرد وصوته عالي») and the page picks the profession and the service, writes the
// title, and says what it understood. Free, on the device, no outside service.
//
// The shape follows the shared plan with «أكلات جدتنا» (server-edge #29): a general Arabic reader
// (`parseIntent`, to move to shared-library/code/arabic-intent once agreed there) and this site's
// own link to its catalogue (`understandRequest`) with its own words (`SERVICE_LEXICON`).

const TASHKEEL = /[ً-ٰٟـ]/g;
const INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

export function normalizeArabic(text) {
  return String(text || '')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, d => String(INDIC.indexOf(d))).replace(/[۰-۹]/g, d => String(PERSIAN.indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Prefixes a word carries in Arabic: «والمكيف»، «بالمطبخ»، «للحمام»، «فالقاطع».
const PREFIXES = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ف', 'ل'];
export function stem(word) {
  let w = word;
  for (const p of PREFIXES) {
    if (w.startsWith(p) && w.length - p.length >= 3) { w = w.slice(p.length); break; }
  }
  // Possessive and plural endings: «مكيفي»، «مكيفات»، «انارات»، «سباكين».
  for (const s of ['ات', 'ين', 'ون', 'يه', 'ي', 'ه']) {
    if (w.endsWith(s) && w.length - s.length >= 3) { w = w.slice(0, -s.length); break; }
  }
  return w;
}
export const tokens = text => normalizeArabic(text).split(' ').filter(Boolean);

// Two words are the same root when they share their first letters (enough of them).
export function sameRoot(a, b) {
  const x = stem(a), y = stem(b);
  if (x.length < 3 || y.length < 3) return x === y;
  const n = Math.min(4, x.length, y.length);
  return x.slice(0, n) === y.slice(0, n);
}

const NUMBER_WORDS = { واحد: 1, وحده: 1, اثنين: 2, ثنين: 2, اثنان: 2, ثلاث: 3, ثلاثه: 3, اربع: 4, اربعه: 4, خمس: 5, خمسه: 5, ست: 6, سته: 6, سبع: 7, سبعه: 7, ثمان: 8, ثمانيه: 8, تسع: 9, تسعه: 9, عشر: 10, عشره: 10 };
const URGENT = ['ضروري', 'مستعجل', 'عاجل', 'الحين', 'الان', 'فورا', 'سريع', 'طارئ', 'طوارئ'];
const WHEN = { اليوم: 'today', الحين: 'now', الان: 'now', بكره: 'tomorrow', بكرا: 'tomorrow', غدا: 'tomorrow', بعدبكره: 'after_tomorrow', الصبح: 'morning', الصباح: 'morning', العصر: 'afternoon', المغرب: 'evening', الليل: 'night', الخميس: 'thursday', الجمعه: 'friday', السبت: 'saturday' };

// The general reader: what any site can take from the sentence (count, budget, time, urgency).
export function parseIntent(text) {
  const norm = normalizeArabic(text);
  const words = norm.split(' ').filter(Boolean);
  const out = { text: norm, words, count: null, budget: null, when: null, urgent: false };
  const budget = norm.match(/(?:بحدود|حدود|ميزانيه|ميزانيتي|بسعر|ب)\s*(\d{2,7})|(\d{2,7})\s*(?:ريال|رس|ر س|sar)/);
  if (budget) out.budget = Number(budget[1] || budget[2]);
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (out.count == null && NUMBER_WORDS[w] != null) out.count = NUMBER_WORDS[w];
    if (out.count == null && /^\d{1,3}$/.test(w) && Number(w) !== out.budget) out.count = Number(w);
    if (!out.when && WHEN[w]) out.when = WHEN[w];
    if (URGENT.includes(w)) out.urgent = true;
  }
  if (/بعد بكره|بعد بكرا/.test(norm)) out.when = 'after_tomorrow';
  return out;
}

// «أي خدمة»'s own words: everyday phrases → the profession (by its fixed short name) and words
// that appear in the names of its services. Matched by root, so «مكيفي» matches «مكيف».
export const SERVICE_LEXICON = [
  { slug: 'ac-cooling', words: ['مكيف', 'مكيفات', 'تكييف', 'تبريد', 'يبرد', 'برد', 'سبليت', 'فريون', 'كمبروسر', 'كمبرسور', 'وحده خارجيه'], service: { 'ينقط': 'صيانه', 'يبرد': 'صيانه', 'تركيب': 'تركيب', 'مركزي': 'مركزيه', 'سبليت': 'سبليت' } },
  { slug: 'plumbing', words: ['سباك', 'سباكه', 'تهريب', 'يهرب', 'تسريب', 'تسرب', 'يسرب', 'انسداد', 'مسدود', 'مسدوده', 'انسد', 'مجاري', 'مجرى', 'بلاعه', 'مغسله', 'حنفيه', 'سيفون', 'كرسي', 'سخان', 'مويه', 'مواسير', 'ماسوره', 'خزان'], service: { 'انسداد': 'تسليك', 'مسدود': 'تسليك', 'مجاري': 'تسليك', 'بلاعه': 'تسليك', 'تهريب': 'تسرب', 'تسريب': 'تسرب', 'يهرب': 'تسرب', 'سخان': 'سخان' } },
  { slug: 'electrical', words: ['كهرب', 'كهربا', 'كهرباء', 'كهربائي', 'قاطع', 'يفصل', 'فاصل', 'فيش', 'افياش', 'لمبه', 'لمبات', 'اناره', 'انارات', 'سبوت', 'اسلاك', 'سلك', 'تماس', 'التماس', 'طبلون', 'ماس'], service: { 'لمبه': 'اناره', 'لمبات': 'اناره', 'اناره': 'اناره', 'سبوت': 'اناره', 'تمديد': 'تمديد', 'يفصل': 'اعطال', 'قاطع': 'اعطال', 'تماس': 'اعطال' } },
  { slug: 'cleaning', words: ['تنظيف', 'نظافه', 'نظيف', 'تعقيم', 'غسيل', 'سجاد', 'موكيت', 'كنب', 'حشرات', 'صراصير', 'بق', 'رش', 'مبيد', 'عامله', 'حوش', 'احواش'], service: { 'سجاد': 'سجاد', 'موكيت': 'سجاد', 'حشرات': 'حشرات', 'صراصير': 'حشرات', 'بق': 'حشرات', 'رش': 'حشرات', 'خزان': 'خزانات', 'حوش': 'احواش', 'مكيف': 'مكيفات' } },
  { slug: 'moving', words: ['نقل', 'عفش', 'اغراض', 'شحن', 'دينا', 'ونيت', 'انقل', 'رحيل'], service: { 'مدينه': 'بين', 'مدن': 'بين', 'فك': 'فك' } },
  { slug: 'paint-decor', words: ['دهان', 'دهانات', 'يدهن', 'صبغ', 'بويه', 'جبس', 'ورق', 'جدران', 'ديكور', 'معجون'], service: { 'جبس': 'جبس', 'ورق': 'ورق', 'دهان': 'دهان', 'يدهن': 'دهان' } },
  { slug: 'gardens', words: ['حديقه', 'حدايق', 'حدائق', 'عشب', 'نجيل', 'زرع', 'زراعه', 'اشجار', 'شجر', 'تنسيق', 'ري'], service: { 'عشب': 'عشب', 'نجيل': 'عشب', 'تنسيق': 'تنسيق' } },
  { slug: 'home-maintenance', words: ['صيانه', 'باب', 'ابواب', 'نافذه', 'نوافذ', 'شباك', 'ستاره', 'ستائر', 'ستاير', 'نجار', 'نجاره', 'اثاث', 'دولاب'], service: { 'باب': 'ابواب', 'ابواب': 'ابواب', 'نافذه': 'نوافذ', 'شباك': 'نوافذ', 'ستاره': 'ستائر', 'ستائر': 'ستائر', 'ستاير': 'ستائر', 'اثاث': 'اثاث', 'دولاب': 'اثاث' } },
];

// Words in many professions' names («تركيب مكيفات»، «تركيب إنارة»، «صيانة عامة») say what kind of
// work, not which profession: they choose the service, never the profession.
const GENERIC = ['تركيب', 'صيانه', 'اصلاح', 'عامه', 'منازل', 'منزليه', 'داخل', 'بين', 'جديد', 'خدمه', 'خدمات'];
const specific = list => list.filter(w => !GENERIC.some(g => sameRoot(w, g)));
const nameWords = row => {
  const names = [row?.name_ar, row?.name_en, ...Object.values(row?.name_translations || {})].filter(Boolean);
  return names.flatMap(tokens).filter(w => w.length >= 3);
};
const hits = (words, list) => words.filter(w => list.some(x => sameRoot(w, x))).length;

// The site's link to its catalogue. `categories` and `services` are the lists the site already
// loads (each with id, slug/category_id and its names in every language).
// `learned` (AYK-420): the roots the site learned from its people's requests, each with the
// profession (and service) it was mostly published under — [{ term, category_id, service_id }].
export function understandRequest(text, { categories = [], services = [], learned = [] } = {}) {
  const intent = parseIntent(text);
  const words = intent.words.filter(w => w.length >= 2);
  const roots = new Set(words.map(stem));
  const known = learned.filter(row => row && roots.has(row.term));
  const phrase = ` ${intent.text} `;
  const scored = categories.map(category => {
    const lexicon = SERVICE_LEXICON.find(entry => entry.slug === category.slug);
    const key = specific(words);
    let score = 3 * hits(key, nameWords(category));
    if (lexicon) score += 2 * hits(key, lexicon.words.filter(w => !w.includes(' '))) + lexicon.words.filter(w => w.includes(' ') && phrase.includes(` ${w} `)).length * 2;
    const own = services.filter(s => Number(s.category_id) === Number(category.id));
    score += own.reduce((sum, s) => sum + hits(key, nameWords(s)), 0);
    score += 2 * known.filter(row => Number(row.category_id) === Number(category.id)).length;
    return { category, score, lexicon, own };
  }).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
  const best = scored[0] || null;
  let service = null;
  if (best) {
    const hints = best.lexicon ? words.map(w => Object.entries(best.lexicon.service).find(([k]) => sameRoot(w, k))?.[1]).filter(Boolean) : [];
    const ranked = best.own.map(s => {
      const names = nameWords(s);
      const taught = known.filter(row => Number(row.service_id) === Number(s.id)).length;
      return { s, score: 2 * hits(words, names) + hits(hints, names) + 2 * taught };
    }).filter(row => row.score > 0).sort((a, b) => b.score - a.score);
    service = ranked[0]?.s || null;
  }
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const firstClause = clean.split(/[.،,؛\n!؟?]/)[0].trim();
  const title = (firstClause.length >= 4 ? firstClause : clean).slice(0, 80).trim();
  const second = scored[1];
  return {
    ...intent,
    category: best?.category || null,
    service,
    title,
    description: clean,
    // Sure when one profession clearly leads; otherwise the page asks the requester to confirm.
    confidence: !best ? 0 : !second ? 1 : Math.min(1, (best.score - second.score) / best.score + 0.3),
    alternatives: scored.slice(1, 3).map(row => row.category),
  };
}
