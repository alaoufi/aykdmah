// AYK-420 (the owner: «اجعله يتعلم من لهجات المستخدمين»). The site learns the words its people use
// for each profession from the requests they publish: every request adds its word roots to the
// profession (and service) it was finally published under, after the requester corrected any guess.
// Only roots and counts are kept — never the text, never who wrote it. A root becomes «learned»
// when it appears in MIN_HITS requests and SHARE of them are one profession; the administration
// can approve (always use, even with fewer requests, or with another profession) or block a word.
const { query, queryOne } = require('../config/database');

const TASHKEEL = /[ً-ٰٟـ]/g;
// The same spelling rules as the page (client/src/utils/requestIntent.mjs); tested together.
function normalizeArabic(text) {
  return String(text || '')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
const PREFIXES = ['وال', 'بال', 'فال', 'كال', 'لل', 'ال', 'و', 'ب', 'ف', 'ل'];
function stem(word) {
  let w = word;
  for (const p of PREFIXES) { if (w.startsWith(p) && w.length - p.length >= 3) { w = w.slice(p.length); break; } }
  for (const s of ['ات', 'ين', 'ون', 'يه', 'ي', 'ه']) { if (w.endsWith(s) && w.length - s.length >= 3) { w = w.slice(0, -s.length); break; } }
  return w;
}
// Words that say nothing about the profession (requests, wishes, places, time, small words).
const STOP = new Set(['ابي', 'ابغى', 'ابغي', 'ابا', 'اريد', 'احتاج', 'محتاج', 'نبي', 'نبغى', 'ودي', 'لو', 'سمحت', 'الله', 'يعطيك', 'العافيه', 'شكرا',
  'في', 'من', 'على', 'الى', 'عن', 'مع', 'هذا', 'هذه', 'هذي', 'ذا', 'فيه', 'فيها', 'عندي', 'عندنا', 'لي', 'لنا', 'انا', 'احد', 'واحد', 'شخص',
  'اليوم', 'بكره', 'بكرا', 'غدا', 'الحين', 'الان', 'الصبح', 'العصر', 'المغرب', 'الليل', 'بعد', 'قبل', 'كل', 'ما', 'لا', 'مو', 'ماهو', 'وش', 'ايش',
  'ضروري', 'مستعجل', 'عاجل', 'سريع', 'بسرعه', 'حي', 'البيت', 'بيت', 'منزل', 'شقه', 'فله', 'غرفه', 'مكان', 'طلب', 'خدمه', 'ريال', 'حدود', 'بحدود',
  'تركيب', 'صيانه', 'اصلاح', 'تصليح', 'جديد', 'قديم', 'كبير', 'صغير', 'زين', 'سيئ', 'مشكله', 'كذا', 'شي', 'شيء', 'وايد', 'مره', 'كثير']);
const MIN_HITS = 3;
const SHARE = 0.7;
const MAX_TERMS = 30;

function termsOf(text) {
  const seen = new Set();
  for (const raw of normalizeArabic(text).split(' ')) {
    if (!raw || /\d/.test(raw) || STOP.has(raw)) continue;
    const root = stem(raw);
    if (root.length < 3 || root.length > 20 || STOP.has(root)) continue;
    seen.add(root);
    if (seen.size >= MAX_TERMS) break;
  }
  return [...seen];
}

// Called after a request is published. Never throws (learning must not break publishing).
async function learnFromRequest({ title, description, category_id: categoryId, service_id: serviceId }) {
  try {
    if (!categoryId) return 0;
    const terms = termsOf(`${title || ''} ${description || ''}`);
    for (const term of terms) {
      for (const service of serviceId ? [0, Number(serviceId)] : [0]) {
        await query(`INSERT INTO dialect_terms (term, category_id, service_id, hits, updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
          ON CONFLICT (term, category_id, service_id) DO UPDATE SET hits = dialect_terms.hits + 1, updated_at = CURRENT_TIMESTAMP`,
        [term, Number(categoryId), service]);
      }
    }
    cache = null;
    return terms.length;
  } catch (_) { return 0; }
}

let cache = null; // { at, rows }
const CACHE_MS = 10 * 60 * 1000;

// Every word with its counts and status, for the administration (and the learned list below).
async function allTerms() {
  const rows = await query(`SELECT t.term, t.category_id, t.service_id, t.hits FROM dialect_terms t ORDER BY t.term`);
  const flags = new Map((await query('SELECT term, status, category_id, service_id FROM dialect_term_flags')).map(row => [row.term, row]));
  const byTerm = new Map();
  for (const row of rows) {
    const entry = byTerm.get(row.term) || { term: row.term, total: 0, categories: new Map(), services: new Map() };
    if (Number(row.service_id) === 0) { entry.total += Number(row.hits); entry.categories.set(Number(row.category_id), Number(row.hits)); }
    else entry.services.set(`${row.category_id}:${row.service_id}`, Number(row.hits));
    byTerm.set(row.term, entry);
  }
  for (const flag of flags.values()) if (!byTerm.has(flag.term)) byTerm.set(flag.term, { term: flag.term, total: 0, categories: new Map(), services: new Map() });
  return [...byTerm.values()].map(entry => {
    const [bestCategory, bestHits] = [...entry.categories.entries()].sort((a, b) => b[1] - a[1])[0] || [null, 0];
    const share = entry.total ? bestHits / entry.total : 0;
    const serviceRows = [...entry.services.entries()].filter(([key]) => Number(key.split(':')[0]) === bestCategory).sort((a, b) => b[1] - a[1]);
    const bestService = serviceRows[0] && bestHits && serviceRows[0][1] / bestHits >= 0.6 ? Number(serviceRows[0][0].split(':')[1]) : null;
    const flag = flags.get(entry.term);
    const learned = flag?.status === 'blocked' ? false : flag?.status === 'approved' ? true : entry.total >= MIN_HITS && share >= SHARE;
    return {
      term: entry.term, total: entry.total, share: Math.round(share * 100) / 100,
      category_id: flag?.status === 'approved' && flag.category_id ? Number(flag.category_id) : bestCategory,
      service_id: flag?.status === 'approved' && flag.category_id ? (flag.service_id ? Number(flag.service_id) : null) : bestService,
      status: flag?.status || (learned ? 'learned' : 'learning'), learned,
    };
  });
}

// What the request page uses: only learned words, small and cached.
async function learnedTerms() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
  const rows = (await allTerms()).filter(row => row.learned && row.category_id)
    .map(row => ({ term: row.term, category_id: row.category_id, service_id: row.service_id }));
  cache = { at: Date.now(), rows };
  return rows;
}

async function setFlag(term, status, { categoryId = null, serviceId = null, userId = null } = {}) {
  if (status === 'clear') await query('DELETE FROM dialect_term_flags WHERE term = ?', [term]);
  else {
    await query(`INSERT INTO dialect_term_flags (term, status, category_id, service_id, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (term) DO UPDATE SET status = EXCLUDED.status, category_id = EXCLUDED.category_id, service_id = EXCLUDED.service_id,
        updated_by = EXCLUDED.updated_by, updated_at = CURRENT_TIMESTAMP`, [term, status, categoryId, serviceId, userId]);
  }
  cache = null;
}
const forget = () => { cache = null; };

module.exports = { normalizeArabic, stem, termsOf, learnFromRequest, allTerms, learnedTerms, setFlag, forget, MIN_HITS, SHARE };
