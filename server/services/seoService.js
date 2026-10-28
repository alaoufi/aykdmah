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

let catalog = { data: null, at: 0 };
async function loadCatalog() {
  if (catalog.data && Date.now() - catalog.at < CACHE_MS) return catalog.data;
  const [categories, services, regions] = await Promise.all([
    Category.findAll(true), Service.findAll({ activeOnly: true }),
    query('SELECT name_ar FROM regions ORDER BY id').catch(() => []),
  ]);
  const data = {
    categories, services,
    regions: regions.map(r => String(r.name_ar).replace(/^(منطقة|المنطقة)\s+/, '').replace(/^ال(شرقية)$/, 'المنطقة الشرقية')),
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

function homePage({ categories, services, regions }) {
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

function categoryPage({ categories, services, regions }, slug) {
  const category = categories.find(c => c.slug === slug);
  if (!category) return null;
  const items = services.filter(s => Number(s.category_id) === Number(category.id));
  const path = `/services/category/${category.slug}`;
  return {
    title: `${category.name_ar} في السعودية — اطلب عروض أسعار | ${NAME}`,
    description: `خدمات ${category.name_ar}: ${items.slice(0, 10).map(s => s.name_ar).join('، ')}. اطلب الآن واستقبل عروضًا من مقدمي خدمة قريبين منك في ${regions.slice(0, 5).join('، ')} وبقية المناطق.`,
    path,
    ld: [breadcrumbs([{ name: NAME, path: '/' }, { name: 'الخدمات', path: '/services' }, { name: category.name_ar, path }]),
      { '@context': 'https://schema.org', '@type': 'ItemList', name: category.name_ar,
        itemListElement: items.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}/services/${s.id}`, name: s.name_ar })) }],
    body: `<h1>${esc(category.name_ar)} في جميع مناطق السعودية</h1>
<p>اختر الخدمة واكتب طلبك مجانًا، وتصلك عروض الأسعار من مقدمي ${esc(category.name_ar)} القريبين منك.</p>
${list(items.map(s => link(`/services/${s.id}`, s.name_ar)))}`,
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

// Returns { status, page } for a public path, or null when the path is not one of them.
async function pageFor(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  if (STATIC[clean]) {
    const s = STATIC[clean];
    return { status: 200, page: { ...s, path: clean, ld: [breadcrumbs([{ name: NAME, path: '/' }, { name: s.h1, path: clean }])], body: `<h1>${esc(s.h1)}</h1><p>${esc(s.description)}</p>` } };
  }
  const data = await loadCatalog();
  if (clean === '/') return { status: 200, page: homePage(data) };
  if (clean === '/services') return { status: 200, page: servicesPage(data) };
  let match = clean.match(/^\/services\/category\/([A-Za-z0-9_-]{1,100})$/);
  if (match) { const page = categoryPage(data, match[1]); return page ? { status: 200, page } : { status: 404, page: null }; }
  match = clean.match(/^\/services\/(\d{1,9})$/);
  if (match) { const page = servicePage(data, match[1]); return page ? { status: 200, page } : { status: 404, page: null }; }
  return null;
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
    .replace('</head>', `    <link rel="canonical" href="${esc(url)}" />\n    <meta property="og:url" content="${esc(url)}" />\n    ${page.ld.map(jsonLd).join('\n    ')}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root"><main class="seo-static" dir="rtl" style="max-width:56rem;margin:0 auto;padding:1rem;font-family:Cairo,Tahoma,sans-serif;line-height:1.9">${page.body}</main></div>`);
  return html;
}

async function sitemap() {
  const { categories, services } = await loadCatalog();
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    ['/', '1.0', 'daily'], ['/services', '0.9', 'weekly'], ['/providers/map', '0.6', 'weekly'], ['/guide', '0.5', 'monthly'],
    ...categories.map(c => [`/services/category/${c.slug}`, '0.8', 'weekly']),
    ...services.map(s => [`/services/${s.id}`, '0.8', 'weekly']),
    ['/privacy', '0.2', 'yearly'], ['/terms', '0.2', 'yearly'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, priority, freq]) =>
    `  <url><loc>${esc(SITE + p)}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join('\n')}\n</urlset>\n`;
}

module.exports = { pageFor, render, sitemap };
