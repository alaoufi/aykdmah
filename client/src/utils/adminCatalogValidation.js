const limitsFor = kind => kind === 'category'
  ? { name_ar: 150, icon: 255, color: 20, description: 20000 }
  : { name_ar: 120, name_en: 120, ...(kind === 'region' ? { code: 20 } : {}) };
export function validateAdminCatalogForm(kind, form, t) {
  const errors = {};
  if (!String(form.name_ar || '').trim()) errors.name_ar = t('dialog.required');
  for (const [field, max] of Object.entries(limitsFor(kind))) {
    if ([...String(form[field] || '')].length > max) errors[field] = t('promote.err.text_too_long', { max });
  }
  if (form.sort_order != null && (!Number.isInteger(Number(form.sort_order)) || Number(form.sort_order) < -2147483648 || Number(form.sort_order) > 2147483647)) errors.sort_order = t('errors.invalid_data');
  return errors;
}
export function catalogResponseErrors(kind, error, t) {
  const limits = limitsFor(kind), fields = new Set([...Object.keys(limits), 'sort_order', 'is_active']);
  const errors = {}, items = error?.response?.data?.errors;
  if (!Array.isArray(items)) return errors;
  for (const item of items) {
    if (!fields.has(item?.field)) continue;
    errors[item.field] = /required|missing|empty/.test(String(item.code)) ? t('dialog.required')
      : /too_long|max_length/.test(String(item.code)) && limits[item.field] ? t('promote.err.text_too_long', { max: limits[item.field] })
        : t('errors.invalid_data');
  }
  return errors;
}
