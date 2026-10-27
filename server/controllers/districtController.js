const { validateCatalog, catalogId } = require('../utils/catalogValidation');
const District = require('../models/District');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { city_id } = req.query;
  const activeOnly = req.query.all !== 'true';
  const items = await District.findAll({ cityId: catalogId(city_id, true), activeOnly });
  return success(res, items);
});

const getOne = asyncHandler(async (req, res) => {
  const item = await District.findById(catalogId(req.params.id));
  if (!item) return notFound(res);
  return success(res, item);
});

const create = asyncHandler(async (req, res) => {
  const data = await validateCatalog('district', req.body, { create: true });
  const item = await District.create(data);
  return created(res, item);
});

const update = asyncHandler(async (req, res) => {
  const id = catalogId(req.params.id);
  const existing = await District.findById(id);
  if (!existing) return notFound(res);
  const data = await validateCatalog('district', req.body, { existing });
  const item = await District.update(id, data);
  return success(res, item, 'تم التحديث');
});

const remove = asyncHandler(async (req, res) => {
  await District.remove(catalogId(req.params.id));
  return success(res, null, 'تم الحذف');
});

module.exports = { list, getOne, create, update, remove };
