const { validateCatalog, catalogId } = require('../utils/catalogValidation');
const Service = require('../models/Service');
const { slugify, uniqueSlug } = require('../utils/slugify');
const { translateAllLanguages, mergeTranslations } = require('../services/entityTranslator');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const { category_id } = req.query;
  const activeOnly = req.query.all !== 'true';
  const items = await Service.findAll({ categoryId: catalogId(category_id, true), activeOnly });
  return success(res, items);
});

const getOne = asyncHandler(async (req, res) => {
  const item = await Service.findById(catalogId(req.params.id));
  if (!item) return notFound(res);
  return success(res, item);
});

const create = asyncHandler(async (req, res) => {
  const input = await validateCatalog('service', req.body, { create: true });
  const name_ar = input.name_ar;
  const description = input.description || null;

  const name_translations = await translateAllLanguages(name_ar, 'ar');
  const description_translations = description
    ? await translateAllLanguages(description, 'ar')
    : null;

  const slugBase = slugify(name_translations.en || name_ar, 'service');
  const slug = await uniqueSlug(slugBase, (s) => Service.slugExists(s));

  const item = await Service.create({
    category_id: input.category_id,
    name_ar,
    name_en: name_translations.en || null,
    slug,
    description,
    icon: input.icon || null,
    base_price: input.base_price ?? null,
    is_urgent_supported: input.is_urgent_supported,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active,
    name_translations,
    description_translations,
  });
  return created(res, item);
});

const update = asyncHandler(async (req, res) => {
  const id = catalogId(req.params.id);
  const existing = await Service.findById(id);
  if (!existing) return notFound(res);
  const data = await validateCatalog('service', req.body, { existing });

  if (data.name_ar && data.name_ar !== existing.name_ar) {
    const name_translations = await translateAllLanguages(String(data.name_ar).trim(), 'ar');
    data.name_translations = mergeTranslations(existing.name_translations, name_translations);
    data.name_en = name_translations.en || existing.name_en;
    const slugBase = slugify(name_translations.en || data.name_ar, 'service');
    data.slug = await uniqueSlug(slugBase, (s, ig) => Service.slugExists(s, ig), { ignoreId: existing.id });
  }

  if (data.description !== undefined && data.description !== existing.description) {
    if (data.description) {
      const dt = await translateAllLanguages(String(data.description).trim(), 'ar');
      data.description_translations = mergeTranslations(existing.description_translations, dt);
    } else {
      data.description_translations = null;
    }
  }

  const item = await Service.update(id, data);
  return success(res, item, req.t('updated'));
});

const remove = asyncHandler(async (req, res) => {
  await Service.softDelete(catalogId(req.params.id));
  return success(res, null, req.t('deleted'));
});

module.exports = { list, getOne, create, update, remove };
