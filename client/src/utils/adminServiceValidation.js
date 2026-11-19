const limits = { name_ar: 150, description: 20000, icon: 255 };
const fields = new Set([...Object.keys(limits), 'category_id', 'base_price', 'sort_order', 'is_active', 'is_urgent_supported']);
export function validateServiceForm(form, t) {
  const errors = {};
  if (!String(form.name_ar || '').trim()) errors.name_ar = t('dialog.required');
  for (const [field, max] of Object.entries(limits)) {
    if ([...String(form[field] || '')].length > max) errors[field] = t('promote.err.text_too_long', { max });
  }
  if (!Number.isInteger(Number(form.category_id)) || Number(form.category_id) < 1) errors.category_id = t('dialog.required');
  if (form.base_price !== '' && form.base_price != null) {
    const amount = Number(form.base_price);
    if (!Number.isFinite(amount) || amount < 0 || amount > 99999999.99 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) errors.base_price = t('wallet.errors.invalid_amount');
  }
  const order = Number(form.sort_order);
  if (!Number.isInteger(order) || order < -2147483648 || order > 2147483647) errors.sort_order = t('errors.invalid_data');
  return errors;
}
export function serviceResponseErrors(error, t) {
  const errors = {};
  const items = error?.response?.data?.errors;
  if (!Array.isArray(items)) return errors;
  for (const item of items) {
    if (!fields.has(item?.field)) continue;
    const code = String(item.code || '');
    errors[item.field] = /required|missing|empty/.test(code) ? t('dialog.required')
      : /too_long|max_length/.test(code) && limits[item.field] ? t('promote.err.text_too_long', { max: limits[item.field] })
        : item.field === 'base_price' ? t('wallet.errors.invalid_amount') : t('errors.invalid_data');
  }
  return errors;
}
