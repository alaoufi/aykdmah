// Search-engine pages (AYK-032). The public pages of the single-page app are served
// with their own title, description, canonical link, structured data (JSON-LD) and a
// readable text block, so Google can index each service and category without running
// JavaScript. React replaces the text block when it starts, so visitors see the app.
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { query } = require('../config/database');
const Category = require('../models/Category');
const Service = require('../models/Service');

const SITE = 'https://aykdmh.com';
const NAME = 'أي خدمة';
const CACHE_MS = 5 * 60 * 1000;
const indexCandidates = () => [process.env.SEO_INDEX_HTML, '/srv/site/current/index.html', path.join(env.PATHS.CLIENT_DIST || '', 'index.html')].filter(Boolean);

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON-LD sits in a <script>; "<" is escaped so text can never close the tag.
const jsonLd = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

let shell = { html: null, at: 0 };
function indexHtml() {
  if (shell.html && Date.now() - shell.at < 30000) return shell.html;
  for (const file of indexCandidates()) {
    try { shell = { html: fs.readFileSync(file, 'utf8'), at: Date.now() }; return shell.html; } catch (_) { /* next */ }
  }
  return null;
}

// The words people search with for each profession (AYK-239): the person they look for and
// other common phrasings, used in titles, descriptions and the readable text.
const SEARCH_WORDS = {
  electrical: { person: 'كهربائي', alt: ['فني كهرباء', 'معلم كهرباء', 'تمديدات كهربائية', 'تصليح كهرباء المنازل'] },
  plumbing: { person: 'سباك', alt: ['فني سباكة', 'معلم سباكة', 'كشف تسربات المياه', 'تسليك مجاري'] },
  'ac-cooling': { person: 'فني تكييف', alt: ['تصليح مكيفات', 'صيانة مكيفات', 'تنظيف مكيفات', 'تركيب مكيفات سبليت'] },
  cleaning: { person: 'شركة تنظيف', alt: ['تنظيف منازل', 'تنظيف فلل وشقق', 'تنظيف خزانات', 'تنظيف كنب وسجاد'] },
  moving: { person: 'نقل عفش', alt: ['شركة نقل أثاث', 'فك وتركيب أثاث', 'نقل عفش مع التغليف', 'دينا نقل'] },
  'paint-decor': { person: 'دهان', alt: ['معلم دهانات', 'فني ديكور', 'ورق جدران', 'جبس بورد'] },
  gardens: { person: 'منسق حدائق', alt: ['تنسيق حدائق', 'زراعة نجيل', 'صيانة حدائق', 'شبكات ري'] },
  'home-maintenance': { person: 'فني صيانة منازل', alt: ['صيانة منزلية', 'معلم صيانة عامة', 'تصليح أبواب ونوافذ', 'صيانة شقق وفلل'] },
};
const wordsFor = category => SEARCH_WORDS[category.slug] || { person: category.name_ar, alt: [] };
const MIN_CITY_DISTRICTS = 3;
// «1-riyadh»: the id keeps it unique, the name keeps it readable.
const citySlug = city => `${city.id}-${String(city.name_en || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'city'}`;

let catalog = { data: null, at: 0 };
async function loadCatalog() {
  if (catalog.data && Date.now() - catalog.at < CACHE_MS) return catalog.data;
  const [categories, services, regions, cities, districts, settings] = await Promise.all([
    Category.findAll(true), Service.findAll({ activeOnly: true }),
    query('SELECT id, name_ar FROM regions ORDER BY id').catch(() => []),
    query(`SELECT c.id, c.name_ar, c.name_en, COALESCE(c.region_id, g.region_id) AS region_id
      FROM cities c LEFT JOIN governorates g ON g.id = c.governorate_id WHERE c.is_active = 1`).catch(() => []),
    query('SELECT city_id, name_ar FROM districts WHERE is_active = 1 ORDER BY id').catch(() => []),
    query(`SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('google_site_verification', 'bing_site_verification', 'google_play_url', 'app_store_url')`).catch(() => []),
  ]);
  const regionName = name => String(name).replace(/^(منطقة|المنطقة)\s+/, '').replace(/^ال(شرقية)$/, 'المنطقة الشرقية');
  const byCity = new Map();
  for (const d of districts) { if (!byCity.has(Number(d.city_id))) byCity.set(Number(d.city_id), []); byCity.get(Number(d.city_id)).push(d.name_ar); }
  const regionById = new Map(regions.map(r => [Number(r.id), regionName(r.name_ar)]));
  // The cities with their own neighbourhoods, biggest first: those get their own pages.
  const cityRows = cities.map(c => ({ ...c, slug: citySlug(c), region: regionById.get(Number(c.region_id)) || '', districts: byCity.get(Number(c.id)) || [] }))
    .filter(c => c.districts.length >= MIN_CITY_DISTRICTS)
    .sort((a, b) => b.districts.length - a.districts.length || a.id - b.id);
  const setting = key => String(settings.find(row => row.setting_key === key)?.setting_value || '').replace(/^"|"$/g, '').trim();
  const data = {
    categories, services, cities: cityRows,
    regions: regions.map(r => regionName(r.name_ar)),
    verification: { google: setting('google_site_verification'), bing: setting('bing_site_verification') },
    sameAs: ['google_play_url', 'app_store_url'].map(setting).filter(url => /^https:\/\//.test(url)),
  };
  catalog = { data, at: Date.now() };
  return data;
}

const ORG = { '@type': 'Organization', name: NAME, url: SITE, logo: `${SITE}/icons/android-chrome-512x512.png`,
  parentOrganization: { '@type': 'Organization', name: 'تربح', url: 'https://trbhh.sa' } };
const breadcrumbs = items => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: `${SITE}${item.path}` })) });
const link = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;
const list = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

function homePage({ categories, services, regions, cities = [] }) {
  const byCategory = categories.map(c => `<h2>${link(`/services/category/${c.slug}`, `${c.icon || ''} ${c.name_ar}`)}</h2>`
    + list(services.filter(s => Number(s.category_id) === Number(c.id)).map(s => link(`/services/${s.id}`, s.name_ar))));
  return {
    title: `${NAME} | صيانة منزلية وكهرباء وسباكة ونظافة في السعودية`,
    description: `${NAME}: اكتب طلبك مجانًا واستقبل عروض أسعار من فنيين ومقدمي خدمة قريبين منك في جميع مناطق المملكة — صيانة كهرباء، سباكة، تكييف، نظافة، نقل وغيرها. قارن وتواصل واختر الأنسب.`,
    path: '/',
    ld: [{ '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, url: SITE, inLanguage: 'ar' }, { '@context': 'https://schema.org', ...ORG }],
    body: `<h1>${NAME} — اطلب أي خدمة منزلية وقارن عروض الأسعار</h1>
<p>منصة سعودية تربطك بمقدمي الخدمة القريبين منك: اكتب ما تحتاجه، وتصلك العروض، وتتواصل بالمحادثة والمكالمة داخل الموقع دون كشف رقمك. متاحة في: ${esc(regions.join('، '))}.</p>
${byCategory.join('\n')}
${cities.length ? `<h2>الخدمات في أكبر المدن</h2>${cities.slice(0, 12).map(city => `<h3>${esc(city.name_ar)}</h3>${list(categories.filter(c => SEARCH_WORDS[c.slug]).map(c => link(`/services/category/${c.slug}/${city.slug}`, `${wordsFor(c).person} في ${city.name_ar}`)))}`).join('\n')}` : ''}
<p>${link('/services', 'كل الخدمات')} · ${link('/providers/map', 'خريطة مقدمي الخدمة')} · ${link('/guide', 'دليل الاستخدام')} · ${link('/register', 'سجّل كمقدم خدمة')}</p>`,
  };
}

function servicesPage({ categories, services }) {
  return {
    title: `جميع الخدمات المنزلية والصيانة | ${NAME}`,
    description: `قائمة خدمات ${NAME}: ${services.slice(0, 12).map(s => s.name_ar).join('، ')} وغيرها، في جميع مناطق السعودية.`,
    path: '/services',
    ld: [breadcrumbs([{ name: NAME, path: '/' }, { name: 'الخدمات', path: '/services' }])],
    body: `<h1>جميع الخدمات</h1>${categories.map(c => `<h2>${link(`/services/category/${c.slug}`, c.name_ar)}</h2>`
      + list(services.filter(s => Number(s.category_id) === Number(c.id)).map(s => link(`/services/${s.id}`, s.name_ar)))).join('\n')}`,
  };
}

function categoryPage({ categories, services, regions, cities = [] }, slug) {
  const category = categories.find(c => c.slug === slug);
  if (!category) return null;
  const items = services.filter(s => Number(s.category_id) === Number(category.id));
  const path = `/services/category/${category.slug}`;
  const words = wordsFor(category);
  const topCities = cities.slice(0, 30);
  return {
    title: `${words.person} في السعودية | ${category.name_ar} — اطلب عروض أسعار | ${NAME}`,
    description: `${words.person} و${words.alt.slice(0, 2).join(' و') || category.name_ar} قريب منك: ${items.slice(0, 6).map(s => s.name_ar).join('، ')}. اطلب مجانًا واستقبل عروضًا في ${topCities.slice(0, 5).map(c => c.name_ar).join('، ') || regions.slice(0, 5).join('، ')} وبقية المدن.`,
    path,
    ld: [breadcrumbs([{ name: NAME, path: '/' }, { name: 'الخدمات', path: '/services' }, { name: category.name_ar, path }]),
      { '@context': 'https://schema.org', '@type': 'ItemList', name: category.name_ar,
        itemListElement: items.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/services/${s.id}`, name: s.name_ar })) }],
    body: `<h1>${esc(words.person)} و${esc(category.name_ar)} في جميع مناطق السعودية</h1>
<p>تبحث عن ${esc([words.person, ...words.alt].join(' أو '))}؟ اختر الخدمة واكتب طلبك مجانًا، وتصلك عروض الأسعار من مقدمي ${esc(category.name_ar)} القريبين منك.</p>
${list(items.map(s => link(`/services/${s.id}`, s.name_ar)))}
${topCities.length ? `<h2>${esc(words.person)} حسب المدينة</h2>${list(topCities.map(c => link(`${path}/${c.slug}`, `${words.person} في ${c.name_ar}`)))}` : ''}`,
  };
}

// One page per profession and city (AYK-239): «سباك في الرياض», with the city's own
// neighbourhoods and the same profession in the nearby cities.
function cityCategoryPage({ categories, services, cities }, slug, cityPart) {
  const category = categories.find(c => c.slug === slug);
  const cityId = Number(String(cityPart).split('-')[0]);
  const city = cities.find(c => Number(c.id) === cityId);
  if (!category || !city) return null;
  const words = wordsFor(category);
  const items = services.filter(s => Number(s.category_id) === Number(category.id));
  const base = `/services/category/${category.slug}`;
  const path = `${base}/${city.slug}`;
  const nearby = cities.filter(c => c.id !== city.id && c.region === city.region).slice(0, 8);
  const others = categories.filter(c => c.id !== category.id).slice(0, 8);
  return {
    title: `${words.person} في ${city.name_ar} | ${[words.alt[0], words.alt[2]].filter(Boolean).join(' و') || category.name_ar} — ${NAME}`,
    description: `تحتاج ${words.person} في ${city.name_ar}؟ اكتب طلبك مجانًا في ${NAME} وتصلك عروض أسعار من مقدمي ${category.name_ar} القريبين منك في أحياء ${city.name_ar}: ${city.districts.slice(0, 4).join('، ')} وغيرها.${words.alt.length ? ` ${words.alt.join('، ')}.` : ''}`,
    path,
    ld: [breadcrumbs([{ name: NAME, path: '/' }, { name: category.name_ar, path: base }, { name: `${words.person} في ${city.name_ar}`, path }]),
      { '@context': 'https://schema.org', '@type': 'Service', name: `${words.person} في ${city.name_ar}`, serviceType: category.name_ar,
        provider: ORG, url: `${SITE}${path}`,
        areaServed: { '@type': 'City', name: city.name_ar, containedInPlace: { '@type': 'Country', name: 'المملكة العربية السعودية' } } }],
    body: `<h1>${esc(words.person)} في ${esc(city.name_ar)}</h1>
<p>تبحث عن ${esc([words.person, ...words.alt].join(' أو '))} في ${esc(city.name_ar)}${city.region ? ` (${esc(city.region)})` : ''}؟ في ${NAME} تكتب طلبك مجانًا مع الحي والموعد المناسب، فيصل لمقدمي ${esc(category.name_ar)} القريبين منك، وتقارن العروض والتقييمات وتتواصل معهم بالمحادثة والمكالمة داخل الموقع دون كشف رقمك.</p>
<h2>خدمات ${esc(category.name_ar)} في ${esc(city.name_ar)}</h2>${list(items.map(s => link(`/services/${s.id}`, `${s.name_ar} في ${city.name_ar}`)))}
<h2>أحياء ${esc(city.name_ar)}</h2><p>${esc(city.districts.slice(0, 40).join('، '))}</p>
${nearby.length ? `<h2>${esc(words.person)} في مدن قريبة</h2>${list(nearby.map(c => link(`${base}/${c.slug}`, `${words.person} في ${c.name_ar}`)))}` : ''}
${others.length ? `<h2>خدمات أخرى في ${esc(city.name_ar)}</h2>${list(others.map(c => link(`/services/category/${c.slug}/${city.slug}`, `${wordsFor(c).person} في ${city.name_ar}`)))}` : ''}
<p>${link('/requests/new', `اطلب ${words.person} في ${city.name_ar} الآن`)}</p>`,
  };
}

function servicePage({ services, regions }, id) {
  const service = services.find(s => String(s.id) === String(id));
  if (!service) return null;
  const path = `/services/${service.id}`;
  const related = services.filter(s => s.category_id === service.category_id && s.id !== service.id).slice(0, 8);
  const description = service.description || '';
  return {
    title: `${service.name_ar} — فنيون قريبون منك في السعودية | ${NAME}`,
    description: `اطلب ${service.name_ar} من ${NAME}: اكتب طلبك مجانًا واستقبل عروض أسعار من مقدمي خدمة قريبين منك، قارن التقييمات وتواصل واختر الأنسب. متاح في ${regions.slice(0, 6).join('، ')} وغيرها.`,
    path,
    ld: [breadcrumbs([{ name: NAME, path: '/' }, { name: service.category_name || 'الخدمات', path: service.category_slug ? `/services/category/${service.category_slug}` : '/services' }, { name: service.name_ar, path }]),
      { '@context': 'https://schema.org', '@type': 'Service', name: service.name_ar, serviceType: service.name_ar,
        category: service.category_name || undefined, provider: ORG, url: `${SITE}${path}`,
        areaServed: { '@type': 'Country', name: 'المملكة العربية السعودية' }, availableLanguage: ['ar', 'en', 'ur', 'hi', 'bn'] }],
    body: `<h1>${esc(service.name_ar)}</h1>
${description ? `<p>${esc(description)}</p>` : ''}
<p>تحتاج ${esc(service.name_ar)}؟ اكتب طلبك في ${NAME} مع الحي والموعد المناسب، وتصلك عروض من مقدمي خدمة قريبين منك، وتتواصل معهم بالمحادثة والمكالمة داخل الموقع.</p>
<h2>المناطق</h2><p>${esc(regions.join('، '))}</p>
${related.length ? `<h2>خدمات ذات صلة</h2>${list(related.map(s => link(`/services/${s.id}`, s.name_ar)))}` : ''}
<p>${link('/requests/new', `اطلب ${service.name_ar} الآن`)}</p>`,
  };
}

const STATIC = {
  '/guide': { title: `دليل استخدام ${NAME}`, description: `كيف تطلب خدمة أو تسجل كمقدم خدمة في ${NAME}: التسجيل، الطلبات والعروض، المحادثة والمكالمات، المحفظة ورقم الدعوة.`, h1: `دليل استخدام ${NAME}` },
  '/providers/map': { title: `خريطة مقدمي الخدمة القريبين منك | ${NAME}`, description: `اعرض مقدمي الخدمة القريبين منك على الخريطة في ${NAME} واطلب منهم مباشرة.`, h1: 'خريطة مقدمي الخدمة' },
  '/privacy': { title: `سياسة الخصوصية | ${NAME}`, description: `سياسة الخصوصية في ${NAME}.`, h1: 'سياسة الخصوصية' },
  '/terms': { title: `الشروط والأحكام | ${NAME}`, description: `الشروط والأحكام لاستخدام ${NAME}.`, h1: 'الشروط والأحكام' },
};

// Search Console / Bing ownership tags and the store links (AYK-239), on every page.
function withSite(page, data) {
  if (!page) return page;
  const ld = (page.ld || []).map(item => (item['@type'] === 'Organization' && data.sameAs?.length ? { ...item, sameAs: data.sameAs } : item));
  return { ...page, ld, verification: data.verification };
}

// A provider's public page (AYK-312), the link a provider shares on WhatsApp and elsewhere. Only
// what the page already shows to guests: the name, profession, city and rating. Link previews read
// the title and description; the page is not offered to search engines (noindex, not in the sitemap).
async function providerPage(id) {
  const policy = await require('../middleware/verificationPolicy').marketplacePolicy();
  if (!policy.allow_guest_browsing) return null;
  const row = (await query(`SELECT u.id, u.full_name, pp.business_name, pp.rating_avg, pp.rating_count,
      c.name_ar AS city_name, cat.name_ar AS category_name
    FROM users u JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN cities c ON c.id = u.city_id LEFT JOIN categories cat ON cat.id = pp.category_id
    WHERE u.id = ? AND u.role = 'provider' AND u.deleted_at IS NULL AND u.is_active = 1 AND u.is_blocked = 0`, [id]))[0];
  if (!row) return null;
  const name = String(row.business_name || row.full_name || '').trim() || 'مقدم خدمة';
  const what = [row.category_name, row.city_name].filter(Boolean).join(' — ');
  const count = Number(row.rating_count) || 0;
  const rating = count ? `⭐ ${Number(row.rating_avg || 0).toFixed(1)} (${count} تقييم)` : '';
  const path = `/providers/${row.id}`;
  return {
    title: `${name}${row.category_name ? ` — ${row.category_name}` : ''} | ${NAME}`,
    description: [what, rating, `تواصل معه مباشرة بالمحادثة والمكالمة في ${NAME}، أو أضفه إلى «دليلي».`].filter(Boolean).join(' · '),
    path, noindex: true,
    ld: [breadcrumbs([{ name: NAME, path: '/' }, { name, path }])],
    body: `<h1>${esc(name)}</h1>${what ? `<p>${esc(what)}</p>` : ''}${rating ? `<p>${esc(rating)}</p>` : ''}<p>${link(path, `افتح صفحة ${name} في ${NAME}`)}</p>`,
  };
}

// Returns { status, page } for a public path, or null when the path is not one of them.
async function pageFor(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  const data = await loadCatalog();
  if (STATIC[clean]) {
    const s = STATIC[clean];
    return { status: 200, page: withSite({ ...s, path: clean, ld: [breadcrumbs([{ name: NAME, path: '/' }, { name: s.h1, path: clean }])], body: `<h1>${esc(s.h1)}</h1><p>${esc(s.description)}</p>` }, data) };
  }
  if (clean === '/') return { status: 200, page: withSite(homePage(data), data) };
  if (clean === '/services') return { status: 200, page: withSite(servicesPage(data), data) };
  let match = clean.match(/^\/services\/category\/([A-Za-z0-9_-]{1,100})\/(\d{1,9}(?:-[a-z0-9-]{0,80})?)$/);
  if (match) { const page = cityCategoryPage(data, match[1], match[2]); return page ? { status: 200, page: withSite(page, data) } : { status: 404, page: null }; }
  match = clean.match(/^\/services\/category\/([A-Za-z0-9_-]{1,100})$/);
  if (match) { const page = categoryPage(data, match[1]); return page ? { status: 200, page: withSite(page, data) } : { status: 404, page: null }; }
  match = clean.match(/^\/providers\/(\d{1,9})$/);
  if (match) { const page = await providerPage(match[1]); return page ? { status: 200, page: withSite(page, data) } : null; }
  match = clean.match(/^\/services\/(\d{1,9})$/);
  if (match) { const page = servicePage(data, match[1]); return page ? { status: 200, page: withSite(page, data) } : { status: 404, page: null }; }
  return null;
}

const TOKEN = /^[A-Za-z0-9_-]{8,120}$/;
function verificationTags(v = {}) {
  return (TOKEN.test(v.google || '') ? `    <meta name="google-site-verification" content="${esc(v.google)}" />\n` : '')
    + (TOKEN.test(v.bing || '') ? `    <meta name="msvalidate.01" content="${esc(v.bing)}" />\n` : '');
}

function render(page) {
  let html = indexHtml();
  if (!html) return null;
  if (!page) return html.replace('<head>', '<head>\n    <meta name="robots" content="noindex" />');
  const url = `${SITE}${page.path === '/' ? '/' : page.path}`;
  html = html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(page.description)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(page.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(page.description)}" />`)
    .replace('</head>', `${page.noindex ? '    <meta name="robots" content="noindex" />\n' : ''}${verificationTags(page.verification)}    <link rel="canonical" href="${esc(url)}" />\n    <meta property="og:url" content="${esc(url)}" />\n    ${page.ld.map(jsonLd).join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"><main class="seo-static" dir="rtl" style="max-width:56rem;margin:0 auto;padding:1rem;font-family:Cairo,Tahoma,sans-serif;line-height:1.9">${page.body}</main></div>`);
  return html;
}

async function sitemap() {
  const { categories, services, cities } = await loadCatalog();
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ['/', '1.0', 'daily'], ['/services', '0.9', 'weekly'], ['/providers/map', '0.6', 'weekly'], ['/guide', '0.5', 'monthly'],
    ...categories.map(c => [`/services/category/${c.slug}`, '0.8', 'weekly']),
    ...services.map(s => [`/services/${s.id}`, '0.8', 'weekly']),
    // Every profession in every city with its own neighbourhoods (AYK-239).
    ...categories.flatMap(c => cities.map(city => [`/services/category/${c.slug}/${city.slug}`, '0.7', 'weekly'])),
    ['/privacy', '0.2', 'yearly'], ['/terms', '0.2', 'yearly'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, priority, freq]) =>
    `  <url><loc>${esc(SITE + p)}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join('\n')}\n</urlset>\n`;
}

module.exports = { pageFor, render, sitemap };
