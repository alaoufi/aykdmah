// Slug generation — supports Arabic & Latin input.
// Arabic letters are transliterated to Latin first; any character that
// can't be represented is dropped. Result is lowercase, dash-separated,
// safe for URLs and database UNIQUE indexes.

const ARABIC_MAP = {
  ا:'a', أ:'a', إ:'i', آ:'a', ٱ:'a',
  ب:'b', ت:'t', ث:'th',
  ج:'j', ح:'h', خ:'kh',
  د:'d', ذ:'dh',
  ر:'r', ز:'z',
  س:'s', ش:'sh',
  ص:'s', ض:'d', ط:'t', ظ:'z',
  ع:'a', غ:'gh',
  ف:'f', ق:'q',
  ك:'k', ل:'l', م:'m', ن:'n',
  ه:'h', ة:'h', و:'w', ؤ:'w',
  ي:'y', ى:'a', ئ:'y', ء:'a',
  ' ':'-', '_':'-',
};

function transliterate(input) {
  let out = '';
  for (const ch of String(input || '')) {
    if (ARABIC_MAP[ch] != null) out += ARABIC_MAP[ch];
    else out += ch;
  }
  return out;
}

function slugify(input, fallbackPrefix = 'item') {
  const transliterated = transliterate(input);
  let slug = transliterated
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')   // strip combining diacritics
    .replace(/[^a-z0-9\s-]/g, '')      // drop anything not safe
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) slug = `${fallbackPrefix}-${Date.now().toString(36)}`;
  return slug.slice(0, 80);
}

// Ensure the slug doesn't collide. existsFn(slug) → Promise<boolean>.
async function uniqueSlug(base, existsFn, { ignoreId = null } = {}) {
  let slug = base;
  let n = 1;
  // Try base, base-2, base-3, …
  // Caller's existsFn handles the ignoreId logic (e.g. WHERE slug=? AND id<>?).
  while (await existsFn(slug, ignoreId)) {
    n += 1;
    slug = `${base}-${n}`;
    if (n > 50) { slug = `${base}-${Date.now().toString(36)}`; break; }
  }
  return slug;
}

module.exports = { slugify, transliterate, uniqueSlug };
