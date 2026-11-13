import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedName } from '../../utils/localize';
import Modal from './AdminModal';
import { createService, updateService } from '../../services/adminService';
import { apiError } from '../../services/api';
import { useAdminConfirmation } from './confirmAdminChange';
import { validateServiceForm, serviceResponseErrors } from '../../utils/adminServiceValidation';

export function ServiceFormFields({ form, setForm, categories, lockedCategoryId, errors = {}, onFieldChange }) {
  const { t, i18n } = useTranslation();
  const categoryId = useId();
  const change = (field, value) => { setForm({ ...form, [field]: value }); onFieldChange?.(field); };
  return <>
          <div>
            <label htmlFor={categoryId} className={`block text-[12px] font-bold mb-1 ${errors.category_id ? 'text-rose-600' : 'text-ink'}`}>{t('admin.service_category')}</label>
            <select id={categoryId} aria-invalid={Boolean(errors.category_id)} aria-describedby={errors.category_id ? `${categoryId}-error` : undefined} required disabled={Boolean(lockedCategoryId)} value={form.category_id} onChange={(e) => change('category_id', Number(e.target.value))}
              className={`w-full px-3 py-2 rounded-card border outline-none text-[14px] ${errors.category_id ? 'border-2 border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500'}`}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{localizedName(c, i18n.resolvedLanguage)}</option>)}
            </select>
            {errors.category_id && <span id={`${categoryId}-error`} role="alert" className="block mt-1 text-[12px] font-bold text-rose-600">{errors.category_id}</span>}
          </div>
          <FieldS label={t('admin.service_name_ar')} error={errors.name_ar} value={form.name_ar} onChange={(v) => change('name_ar', v)} required />
          <div className="px-3 py-2 rounded-card bg-info-soft text-info text-[12px]">
            🌐 {t('admin.auto_translate_hint')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldS label={t('admin.category_icon')} error={errors.icon} value={form.icon} onChange={(v) => change('icon', v)} placeholder="🛠️" />
            <FieldS label={t('admin.service_base_price')} type="number" error={errors.base_price} value={form.base_price} onChange={(v) => change('base_price', v)} />
            <FieldS label={t('admin.category_sort_order')} type="number" error={errors.sort_order} value={form.sort_order} onChange={(v) => change('sort_order', Number(v) || 0)} />
          </div>
          <FieldS label={t('admin.category_description')} error={errors.description} value={form.description} onChange={(v) => change('description', v)} multiline />
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" aria-invalid={Boolean(errors.is_active)} aria-describedby={errors.is_active ? `${categoryId}-active-error` : undefined} checked={!!form.is_active} onChange={(e) => change('is_active', e.target.checked)} />
              <span>{t('admin.is_active')}</span>
              {errors.is_active && <span id={`${categoryId}-active-error`} role="alert" className="text-rose-600 font-bold">{errors.is_active}</span>}
            </label>
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" aria-invalid={Boolean(errors.is_urgent_supported)} aria-describedby={errors.is_urgent_supported ? `${categoryId}-urgent-error` : undefined} checked={!!form.is_urgent_supported} onChange={(e) => change('is_urgent_supported', e.target.checked)} />
              <span>{t('admin.service_urgent_supported')}</span>
              {errors.is_urgent_supported && <span id={`${categoryId}-urgent-error`} role="alert" className="text-rose-600 font-bold">{errors.is_urgent_supported}</span>}
            </label>
          </div>
  </>;
}

export default function ServiceEditorModal({ service, category, categories, onClose, onSaved }) {
  const { t } = useTranslation();
  const confirmAdminChange = useAdminConfirmation();
  const [form, setForm] = useState(() => ({
    name_ar: service?.name_ar || '', description: service?.description || '', icon: service?.icon || '',
    base_price: service?.base_price ?? '', category_id: category.id, is_active: service ? !!service.is_active : true,
    is_urgent_supported: service ? !!service.is_urgent_supported : true, sort_order: service?.sort_order || 0,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const inFlight = useRef(false);
  const formRef = useRef(null);
  const markErrors = found => {
    setFieldErrors(found);
    setTimeout(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus(), 0);
  };
  const save = async e => {
    e.preventDefault();
    if (inFlight.current) return;
    const found = validateServiceForm(form, t);
    if (Object.keys(found).length) { markErrors(found); return; }
    inFlight.current = true;
    try {
      if (service && !(await confirmAdminChange(t, service.name_ar))) return;
      setSaving(true); setError(''); setFieldErrors({});
      const payload = { ...form, category_id: category.id, base_price: form.base_price === '' ? null : Number(form.base_price),
        is_active: form.is_active ? 1 : 0, is_urgent_supported: form.is_urgent_supported ? 1 : 0 };
      if (service) await updateService(service.id, payload); else await createService(payload);
      await onSaved(category.id); onClose();
    } catch (err) {
      const found = serviceResponseErrors(err, t);
      if (Object.keys(found).length) markErrors(found);
      else setError(apiError(err));
    } finally { inFlight.current = false; setSaving(false); }
  };
  return <Modal open title={service ? t('admin.edit') : t('admin.new')} onClose={saving ? undefined : onClose} width={600}
    footer={<><button type="button" disabled={saving} onClick={onClose} className="btn btn-outline">{t('admin.cancel_btn')}</button>
      <button type="submit" form="admin-subservice-form" disabled={saving} className="btn btn-primary">{t(saving ? 'admin.saving' : 'admin.save')}</button></>}>
    <form ref={formRef} noValidate id="admin-subservice-form" onSubmit={save} className="space-y-3">
      {error && <div role="alert" className="text-rose-700 text-[13px]">{error}</div>}
      <ServiceFormFields form={form} setForm={setForm} categories={categories} lockedCategoryId={category.id} errors={fieldErrors}
        onFieldChange={field => { setFieldErrors(prev => ({ ...prev, [field]: '' })); setError(''); }} />
    </form>
  </Modal>;
}

function FieldS({ label, value, onChange, type = 'text', required = false, placeholder = '', multiline = false, error }) {
  const id = useId();
  const cls = `w-full px-3 py-2 rounded-card border outline-none text-[14px] ${error ? 'border-2 border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500'}`;
  const a11y = { 'aria-invalid': Boolean(error), 'aria-describedby': error ? `${id}-error` : undefined };
  return (
    <div>
      <label htmlFor={id} className={`block text-[12px] font-bold mb-1 ${error ? 'text-rose-600' : 'text-ink'}`}>{label}</label>
      {multiline ? (
        <textarea {...a11y} id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input {...a11y} id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
      {error && <span id={`${id}-error`} role="alert" className="block mt-1 text-[12px] font-bold text-rose-600">{error}</span>}
    </div>
  );
}
