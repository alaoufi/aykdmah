import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizedName } from '../../utils/localize';
import Modal from './AdminModal';
import { createService, updateService } from '../../services/adminService';
import { apiError } from '../../services/api';
import { useAdminConfirmation } from './confirmAdminChange';
import { validateServiceForm, serviceResponseErrors } from '../../utils/adminServiceValidation';
import { InfoButton, InfoPanel } from '../common/InfoTip';

// AYK-415: a short line under each field of the service form, and (i) for the full explanation.
const HELP = {
  category_id: {
    short: 'المهنة التي تتبعها هذه الخدمة.',
    info: 'تظهر الخدمة ضمن خدمات هذه المهنة. عند الإضافة أو التعديل من داخل مهنة تكون المهنة محددة ولا تتغير هنا.\nحقل إلزامي.',
  },
  name_ar: {
    short: 'اسم الخدمة كما يراه الزوار، ويُترجم تلقائيًا إلى لغات الموقع.',
    info: 'الاسم الذي يظهر للزوار ضمن خدمات المهنة. بعد الحفظ يترجمه الموقع تلقائيًا إلى لغاته الإحدى عشرة، وتُعاد الترجمة كلما غيّرته.\nحقل إلزامي، حتى 150 حرفًا. مثال: إصلاح تسرب مياه.',
  },
  icon: {
    short: 'رمز تعبيري (إيموجي) يظهر بجانب اسم الخدمة، مثل 🚿.',
    info: 'يظهر بجانب اسم الخدمة في قائمة خدمات المهنة بلوحة الإدارة.\nالصق رمزًا تعبيريًا واحدًا، مثل 🚿.\nإن تُرك فارغًا يظهر الرمز 🛠️.',
  },
  base_price: {
    short: 'سعر استرشادي للخدمة بعملة الموقع، يظهر في قائمة الخدمات هنا.',
    info: 'مبلغ تقريبي للخدمة يظهر تحت اسمها في قائمة خدمات المهنة بلوحة الإدارة. لا يُلزم مقدمي الخدمة ولا يُخصم من أحد.\nرقم من 0 فأكثر وحتى خانتين بعد الفاصلة، مثال: 150 أو 99.50.\nاختياري، وإن تُرك فارغًا لا يظهر سعر.',
  },
  sort_order: {
    short: 'مكان الخدمة بين خدمات مهنتها: الرقم الأصغر يظهر أولًا.',
    info: 'تُرتب خدمات المهنة في الموقع تصاعديًا حسب هذا الرقم، ثم أبجديًا عند التساوي.\nرقم صحيح، مثال: 1 لأول خدمة. إن تُرك فارغًا يُحفظ 0.',
  },
  description: {
    short: 'وصف مختصر للخدمة، يُحفظ ويُترجم تلقائيًا إلى لغات الموقع.',
    info: 'نص يشرح ما تشمله الخدمة. يترجمه الموقع تلقائيًا إلى لغاته الإحدى عشرة عند الحفظ.\nلا يظهر حاليًا للزوار في صفحات الموقع.\nاختياري.',
  },
  is_active: {
    short: 'عند إلغائه تختفي الخدمة عن الزوار، وتبقى محفوظة هنا.',
    info: 'الخدمة النشطة فقط تظهر للزوار وتُحسب في عدد خدمات المهنة. إلغاء التفعيل لا يحذف الخدمة، ويمكن إعادتها في أي وقت.',
  },
  is_urgent_supported: {
    short: 'علامة أن الخدمة تقبل الطلبات العاجلة.',
    info: 'تُحفظ هذه العلامة مع الخدمة، لكنها لا تغيّر حاليًا شيئًا في الموقع: يستطيع صاحب الطلب وصفه بالعاجل في أي خدمة.',
  },
};

export function ServiceFormFields({ form, setForm, categories, lockedCategoryId, errors = {}, onFieldChange }) {
  const { t, i18n } = useTranslation();
  const categoryId = useId();
  const [categoryInfoOpen, setCategoryInfoOpen] = useState(false);
  const change = (field, value) => { setForm({ ...form, [field]: value }); onFieldChange?.(field); };
  return <>
          <div>
            <div className="mb-1">
              <span className="flex items-center gap-1.5">
                <label htmlFor={categoryId} className={`block text-[12px] font-bold ${errors.category_id ? 'text-rose-600' : 'text-ink'}`}>{t('admin.service_category')}</label>
                <InfoButton open={categoryInfoOpen} onToggle={() => setCategoryInfoOpen(v => !v)} controls={`${categoryId}-info`} label={t('admin.service_category')} />
              </span>
              <div id={`${categoryId}-hint`} className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{HELP.category_id.short}</div>
              <InfoPanel id={`${categoryId}-info`} open={categoryInfoOpen}>{HELP.category_id.info}</InfoPanel>
            </div>
            <select id={categoryId} aria-invalid={Boolean(errors.category_id)} aria-describedby={errors.category_id ? `${categoryId}-error ${categoryId}-hint` : `${categoryId}-hint`} required disabled={Boolean(lockedCategoryId)} value={form.category_id} onChange={(e) => change('category_id', Number(e.target.value))}
              className={`w-full px-3 py-2 rounded-card border outline-none text-[14px] ${errors.category_id ? 'border-2 border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500'}`}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{localizedName(c, i18n.resolvedLanguage)}</option>)}
            </select>
            {errors.category_id && <span id={`${categoryId}-error`} role="alert" className="block mt-1 text-[12px] font-bold text-rose-600">{errors.category_id}</span>}
          </div>
          <FieldS label={t('admin.service_name_ar')} hint={HELP.name_ar.short} info={HELP.name_ar.info} error={errors.name_ar} value={form.name_ar} onChange={(v) => change('name_ar', v)} required />
          <div className="px-3 py-2 rounded-card bg-info-soft text-info text-[12px]">
            🌐 سيُترجم الاسم والوصف تلقائيًا إلى كل لغات الموقع عند الحفظ.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <FieldS label={t('admin.category_icon')} hint={HELP.icon.short} info={HELP.icon.info} error={errors.icon} value={form.icon} onChange={(v) => change('icon', v)} placeholder="🛠️" />
            <FieldS label={t('admin.service_base_price')} hint={HELP.base_price.short} info={HELP.base_price.info} type="number" error={errors.base_price} value={form.base_price} onChange={(v) => change('base_price', v)} />
            <FieldS label={t('admin.category_sort_order')} hint={HELP.sort_order.short} info={HELP.sort_order.info} type="number" error={errors.sort_order} value={form.sort_order} onChange={(v) => change('sort_order', Number(v) || 0)} />
          </div>
          <FieldS label={t('admin.category_description')} hint={HELP.description.short} info={HELP.description.info} error={errors.description} value={form.description} onChange={(v) => change('description', v)} multiline />
          <div className="flex flex-wrap gap-4">
            <CheckHelp label={t('admin.is_active')} hint={HELP.is_active.short} info={HELP.is_active.info}>
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" aria-invalid={Boolean(errors.is_active)} aria-describedby={errors.is_active ? `${categoryId}-active-error` : undefined} checked={!!form.is_active} onChange={(e) => change('is_active', e.target.checked)} />
              <span>{t('admin.is_active')}</span>
              {errors.is_active && <span id={`${categoryId}-active-error`} role="alert" className="text-rose-600 font-bold">{errors.is_active}</span>}
            </label>
            </CheckHelp>
            <CheckHelp label={t('admin.service_urgent_supported')} hint={HELP.is_urgent_supported.short} info={HELP.is_urgent_supported.info}>
            <label className="inline-flex items-center gap-2 text-[13px] cursor-pointer">
              <input type="checkbox" aria-invalid={Boolean(errors.is_urgent_supported)} aria-describedby={errors.is_urgent_supported ? `${categoryId}-urgent-error` : undefined} checked={!!form.is_urgent_supported} onChange={(e) => change('is_urgent_supported', e.target.checked)} />
              <span>{t('admin.service_urgent_supported')}</span>
              {errors.is_urgent_supported && <span id={`${categoryId}-urgent-error`} role="alert" className="text-rose-600 font-bold">{errors.is_urgent_supported}</span>}
            </label>
            </CheckHelp>
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

// A checkbox with its (i), the short line under it, and the opened explanation.
function CheckHelp({ label, hint, info, children }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div>
      <span className="flex items-center gap-1.5">
        {children}
        {info && <InfoButton open={open} onToggle={() => setOpen(v => !v)} controls={panelId} label={label} />}
      </span>
      {hint && <div className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{hint}</div>}
      {info && <InfoPanel id={panelId} open={open}>{info}</InfoPanel>}
    </div>
  );
}

function FieldS({ label, hint, info, value, onChange, type = 'text', required = false, placeholder = '', multiline = false, error }) {
  const id = useId();
  const [infoOpen, setInfoOpen] = useState(false);
  const cls = `w-full px-3 py-2 rounded-card border outline-none text-[14px] ${error ? 'border-2 border-rose-500 bg-rose-50' : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-brand-500'}`;
  const a11y = { 'aria-invalid': Boolean(error), 'aria-describedby': [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined };
  return (
    <div>
      <div className="mb-1">
        <span className="flex items-center gap-1.5">
          <label htmlFor={id} className={`block text-[12px] font-bold ${error ? 'text-rose-600' : 'text-ink'}`}>{label}</label>
          {info && <InfoButton open={infoOpen} onToggle={() => setInfoOpen(v => !v)} controls={`${id}-info`} label={label} />}
        </span>
        {hint && <div id={`${id}-hint`} className="text-[12px] text-slate-500 mt-0.5 leading-snug" data-testid="field-short">{hint}</div>}
        {info && <InfoPanel id={`${id}-info`} open={infoOpen}>{info}</InfoPanel>}
      </div>
      {multiline ? (
        <textarea {...a11y} id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      ) : (
        <input {...a11y} id={id} type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
      {error && <span id={`${id}-error`} role="alert" className="block mt-1 text-[12px] font-bold text-rose-600">{error}</span>}
    </div>
  );
}
