'use strict';
// The services of a profession (AYK-496): read once and kept for a short while, because the
// board, the providers list and the nearby list each asked for it on every request
// (6,000 identical lookups in one speed run). A change made by the admin shows within TTL.
const { query } = require('../config/database');

const TTL_MS = 30 * 1000;
let cache = { at: 0, byCategory: new Map() };

async function load() {
  if (Date.now() - cache.at < TTL_MS) return cache.byCategory;
  const rows = await query('SELECT id, category_id FROM services');
  const byCategory = new Map();
  for (const row of rows) {
    const key = Number(row.category_id);
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(Number(row.id));
  }
  cache = { at: Date.now(), byCategory };
  return byCategory;
}

async function serviceIdsOf(categoryIds) {
  const map = await load();
  const ids = [];
  for (const id of [].concat(categoryIds)) ids.push(...(map.get(Number(id)) || []));
  return ids;
}

function forgetCategoryServices() { cache = { at: 0, byCategory: new Map() }; }

module.exports = { serviceIdsOf, forgetCategoryServices };
