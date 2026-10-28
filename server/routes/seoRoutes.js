const express = require('express');
const router = express.Router();
const seo = require('../services/seoService');
const logger = require('../utils/logger');

// Caddy rewrites public pages to /api/seo/page/<path> (see deploy/caddy/Caddyfile).
router.get(/^\/page(\/.*)?$/, async (req, res) => {
  let result = null;
  try { result = await seo.pageFor(req.params[0] || '/'); } catch (err) { logger.warn('SEO page failed:', err.message); }
  const html = seo.render(result?.page || null);
  if (!html) return res.status(503).end();
  res.setHeader('Cache-Control', 'no-cache');
  res.status(result?.status || 200).type('html').send(html);
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('application/xml').send(await seo.sitemap());
  } catch (err) { next(err); }
});

module.exports = router;
