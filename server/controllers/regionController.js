const { validateCatalog, catalogId, reorderIds } = require('../utils/catalogValidation');
const Region = require('../models/Region');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const activeOnly = req.query.all !== 'true';
  const countryId = req.query.country_id || req.query.countryId;
  const items = await Region.findAll({ activeOnly, countryId: catalogId(countryId, true) });
  return success(res, items);
});

const getOne = asyncHandler(async (req, res) => {
  const item = await Region.findById(catalogId(req.params.id));
  if (!item) return notFound(res);
  return success(res, item);
});

const create = asyncHandler(async (req, res) => {
  const data = await validateCatalog('region', req.body, { create: true });
  const item = await Region.create(data);
  return created(res, item);
});

const update = asyncHandler(async (req, res) => {
  const id = catalogId(req.params.id);
  const existing = await Region.findById(id);
  if (!existing) return notFound(res);
  const data = await validateCatalog('region', req.body, { existing });
  const item = await Region.update(id, data);
  return success(res, item, 'تم التحديث');
});

const remove = asyncHandler(async (req, res) => {
  await Region.remove(catalogId(req.params.id));
  return success(res, null, 'تم الحذف');
});

// Bulk reorder: client sends the array of region IDs in the new
// display order. We persist sort_order = index for every row in a
// single transaction. Idempotent.
const reorder = asyncHandler(async (req, res) => {
  const ids = reorderIds(req.body);
  await Region.reorder(ids);
  return success(res, { count: ids.length }, 'تم تحديث الترتيب');
});

module.exports = { list, getOne, create, update, remove, reorder };
