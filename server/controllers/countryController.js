const { validateCatalog, catalogId, reorderIds } = require('../utils/catalogValidation');
const Country = require('../models/Country');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

// Public — only enabled countries
const listPublic = asyncHandler(async (req, res) => {
  const items = await Country.listAll({ activeOnly: true });
  return success(res, items);
});

// Admin — every country (incl. disabled) for management
const listAll = asyncHandler(async (req, res) => {
  const items = await Country.listAll();
  return success(res, items);
});

const create = asyncHandler(async (req, res) => {
  const data = await validateCatalog('country', req.body, { create: true });
  const item = await Country.create(data);
  return created(res, item);
});

const update = asyncHandler(async (req, res) => {
  const data = await validateCatalog('country', req.body);
  const item = await Country.update(catalogId(req.params.id), data);
  if (!item) return notFound(res);
  return success(res, item, req.t('updated'));
});

const remove = asyncHandler(async (req, res) => {
  await Country.remove(catalogId(req.params.id));
  return success(res, null, req.t('user_deleted'));
});

const reorder = asyncHandler(async (req, res) => {
  const ids = reorderIds(req.body);
  await Country.reorder(ids);
  return success(res, { count: ids.length }, req.t('updated'));
});

module.exports = { listPublic, listAll, create, update, remove, reorder };
