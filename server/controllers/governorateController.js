const { validateCatalog, catalogId } = require('../utils/catalogValidation');
const Governorate = require('../models/Governorate');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { region_id } = req.query;
  const activeOnly = req.query.all !== 'true';
  const items = await Governorate.findAll({ regionId: catalogId(region_id, true), activeOnly });
  return success(res, items);
});

const getOne = asyncHandler(async (req, res) => {
  const item = await Governorate.findById(catalogId(req.params.id));
  if (!item) return notFound(res);
  return success(res, item);
});

const create = asyncHandler(async (req, res) => {
  const data = await validateCatalog('governorate', req.body, { create: true });
  const item = await Governorate.create(data);
  return created(res, item);
});

const update = asyncHandler(async (req, res) => {
  const id = catalogId(req.params.id);
  const existing = await Governorate.findById(id);
  if (!existing) return notFound(res);
  const data = await validateCatalog('governorate', req.body, { existing });
  const item = await Governorate.update(id, data);
  return success(res, item, 'تم التحديث');
});

const remove = asyncHandler(async (req, res) => {
  await Governorate.remove(catalogId(req.params.id));
  return success(res, null, 'تم الحذف');
});

module.exports = { list, getOne, create, update, remove };
