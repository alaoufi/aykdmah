const { validateCatalog, catalogId, reorderIds } = require('../utils/catalogValidation');
const City = require('../models/City');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { governorate_id, region_id } = req.query;
  const activeOnly = req.query.all !== 'true';
  const items = await City.findAll({
    governorateId: catalogId(governorate_id, true),
    regionId: catalogId(region_id, true),
    activeOnly,
  });
  return success(res, items);
});

const getOne = asyncHandler(async (req, res) => {
  const item = await City.findById(catalogId(req.params.id));
  if (!item) return notFound(res);
  return success(res, item);
});

const create = asyncHandler(async (req, res) => {
  const data = await validateCatalog('city', req.body, { create: true });
  const item = await City.create(data);
  return created(res, item);
});

const update = asyncHandler(async (req, res) => {
  const id = catalogId(req.params.id);
  const existing = await City.findById(id);
  if (!existing) return notFound(res);
  const data = await validateCatalog('city', req.body, { existing });
  const item = await City.update(id, data);
  return success(res, item, 'تم التحديث');
});

const remove = asyncHandler(async (req, res) => {
  await City.remove(catalogId(req.params.id));
  return success(res, null, 'تم الحذف');
});

const reorder = asyncHandler(async (req, res) => {
  const ids = reorderIds(req.body);
  await City.reorder(ids);
  return success(res, { count: ids.length }, 'تم تحديث الترتيب');
});

module.exports = { list, getOne, create, update, remove, reorder };
