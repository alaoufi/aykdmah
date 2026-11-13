const { validateCatalog, catalogId } = require('../utils/catalogValidation');
const Category = require('../models/Category');
const { slugify, uniqueSlug } = require('../utils/slugify');
const { translateAllLanguages, mergeTranslations } = require('../services/entityTranslator');
const { success, created, notFound } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const activeOnly = req.query.all !== 'true';
  const items = await Category.findAll(activeOnly);
  return success(res, items);
});

const getOne = asyncHandler(async (req, res) => {
  const cat = await Category.findById(catalogId(req.params.id));
  if (!cat) return notFound(res);
  return success(res, cat);
});

// Admin enters only Arabic name + visuals.
// Server: auto-translates to every supported language and auto-slugs.
const create = asyncHandler(async (req, res) => {
  const input = await validateCatalog('category', req.body, { create: true });
  const name_ar = input.name_ar;
  const description = input.description || null;

  // 1) Translate name + description into all platform languages
  const name_translations = await translateAllLanguages(name_ar, 'ar');
  const description_translations = description
    ? await translateAllLanguages(description, 'ar')
    : null;

  // 2) Generate a URL-safe slug from the English translation (cleaner than
  //    Arabic transliteration when available), unique across the table
  const slugBase = slugify(name_translations.en || name_ar, 'category');
  const slug = await uniqueSlug(slugBase, (s) => Category.slugExists(s));

  const cat = await Category.create({
    name_ar,
    name_en: name_translations.en || null,
    slug,
    icon: input.icon || null,
    color: input.color || null,
    description: description_translations ? (description_translations.ar || description) : description,
    sort_order: input.sort_order ?? 0,
    is_active: input.is_active,
    name_translations,
    description_translations,
  });
  return created(res, cat);
});

const update = asyncHandler(async (req, res) => {
  const id = catalogId(req.params.id);
  const existing = await Category.findById(id);
  if (!existing) return notFound(res);

  const data = await validateCatalog('category', req.body, { existing });

  // If name_ar changed → re-translate everywhere and refresh slug.
  // Visual fields (icon, color, sort_order, is_active) don't trigger
  // translation calls.
  if (data.name_ar && data.name_ar !== existing.name_ar) {
    const name_translations = await translateAllLanguages(String(data.name_ar).trim(), 'ar');
    data.name_translations = mergeTranslations(existing.name_translations, name_translations);
    data.name_en = name_translations.en || existing.name_en;
    const slugBase = slugify(name_translations.en || data.name_ar, 'category');
    data.slug = await uniqueSlug(slugBase, (s, ig) => Category.slugExists(s, ig), { ignoreId: existing.id });
  }

  if (data.description !== undefined && data.description !== existing.description) {
    if (data.description) {
      const dt = await translateAllLanguages(String(data.description).trim(), 'ar');
      data.description_translations = mergeTranslations(existing.description_translations, dt);
    } else {
      data.description_translations = null;
    }
  }

  const cat = await Category.update(id, data);
  return success(res, cat, req.t('updated'));
});

const remove = asyncHandler(async (req, res) => {
  await Category.softDelete(catalogId(req.params.id));
  return success(res, null, req.t('deleted'));
});

module.exports = { list, getOne, create, update, remove };
