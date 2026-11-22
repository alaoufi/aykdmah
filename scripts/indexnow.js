#!/usr/bin/env node
// Tells the search engines that take IndexNow (Bing, and through it DuckDuckGo and Yahoo; Yandex,
// Naver, Seznam) about every page in the sitemap (AYK-337). Google does not take IndexNow: it reads
// the sitemap named in robots.txt, and the owner adds the site in Search Console.
// The key is public by design: the engines read it back from https://aykdmh.com/<key>.txt.
// Usage: node scripts/indexnow.js            (sends)
//        node scripts/indexnow.js --dry-run  (only counts)
const SITE = process.env.SITE_URL || 'https://aykdmh.com'; // AYK-428: SITE_URL=https://aykdmh.sa after the move
const KEY = '489189f4fbf06f9402b187af2f9820de';

(async () => {
  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
  if (!urlList.length) throw new Error('the sitemap has no pages');
  const served = (await (await fetch(`${SITE}/${KEY}.txt`)).text()).trim();
  if (served !== KEY) throw new Error('the key file is not on the site yet');
  if (process.argv.includes('--dry-run')) { console.log(`${urlList.length} pages would be sent`); return; }
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'aykdmh.com', key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
  });
  console.log(`${urlList.length} pages sent: ${res.status} ${res.statusText}`);
  if (!res.ok && res.status !== 202) process.exit(1);
})().catch(error => { console.error(error.message); process.exit(1); });
