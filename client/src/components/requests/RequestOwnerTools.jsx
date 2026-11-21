import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRequestReach, updateRequest } from '../../services/requestService';
import { listCategories, listServices, listCities, listDistricts } from '../../services/serviceService';
import { localizedName } from '../../utils/localize';
import { apiError } from '../../services/api';
import Button from '../common/Button';
import Input from '../common/Input';

// AYK-399 (the owner: «يعرض طلبه ولا يظهر لمقدمي الخدمة»). The owner of an open request sees how many
// providers have it on their board, and, when none does, why and what to do.
export function RequestReach({ requestId, version }) {
  const { t } = useTranslation();
  const [reach, setReach] = useState(null);
  useEffect(() => {
    let alive = true;
    getRequestReach(requestId).then(value => { if (alive) setReach(value); }).catch(() => {});
    return () => { alive = false; };
  }, [requestId, version]);
  if (!reach) return null;
  const none = reach.providers === 0;
  return (
    <div className={`card mb-4 text-[13.5px] ${none ? 'bg-warning-soft' : ''}`} role="status" data-testid="request-reach">
      {none
        ? <>
          <b className="block mb-1">⚠️ {t('request.reach_none')}</b>
          <span className="text-fg-muted">{t(reach.in_profession_anywhere === 0 ? 'request.reach_none_profession' : 'request.reach_none_area')}</span>
        </>
        : <b>📣 {t('request.reach_count', { count: reach.providers })}</b>}
    </div>
  );
}

// AYK-402 (the owner: «طالب الخدمة إمكانية تعديل طلبه قبل الاتفاق»): text, profession, service, place
// and urgency, while the request is open and nobody is assigned.
export function RequestEdit({ request, onSaved }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const start = () => {
    setForm({
      title: request.title || '', description: request.description === request.title ? '' : (request.description || ''),
      category_id: request.category_id ? String(request.category_id) : '', service_id: request.service_id ? String(request.service_id) : '',
      city_id: request.city_id ? String(request.city_id) : '', district_id: request.district_id ? String(request.district_id) : '',
      is_urgent: Boolean(Number(request.is_urgent)),
    });
    setError(''); setOpen(true);
  };
  useEffect(() => { if (open) { listCategories().then(setCategories).catch(() => {}); listCities().then(setCities).catch(() => {}); } }, [open]);
  useEffect(() => { setServices([]); if (open && form?.category_id) listServices(form.category_id).then(rows => setServices(rows || [])).catch(() => {}); }, [open, form?.category_id]);
  useEffect(() => { setDistricts([]); if (open && form?.city_id) listDistricts(form.city_id).then(rows => setDistricts(rows || [])).catch(() => {}); }, [open, form?.city_id]);
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value,
    ...(key === 'category_id' ? { service_id: '' } : {}), ...(key === 'city_id' ? { district_id: '' } : {}) }));
  const needsDistrict = districts.length > 0 && !form?.district_id;
  const save = async () => {
    setSaving(true); setError('');
    try {
      await updateRequest(request.id, {
        title: form.title, description: form.description, is_urgent: form.is_urgent,
        category_id: form.category_id ? Number(form.category_id) : null, service_id: form.service_id ? Number(form.service_id) : null,
        city_id: form.city_id ? Number(form.city_id) : null, district_id: form.district_id ? Number(form.district_id) : null,
      });
      setOpen(false);
      onSaved?.();
    } catch (err) { setError(apiError(err)); } finally { setSaving(false); }
  };
  if (!open) {
    return <Button variant="outline" size="sm" onClick={start} data-testid="request-edit-open">✏️ {t('request.edit')}</Button>;
  }
  const select = (key, label, rows, extra = {}) => (
    <label className="block text-[13px] font-semibold">
      {label}
      <select className="select mt-1 w-full" value={form[key]} onChange={e => set(key, e.target.value)} data-testid={`request-edit-${key}`} {...extra}>
        <option value="">{label}</option>
        {rows.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
      </select>
    </label>
  );
  return (
    <div className="card mb-4 space-y-3" data-testid="request-edit">
      <b>✏️ {t('request.edit')}</b>
      <p className="text-[12.5px] text-fg-muted m-0">{t('request.edit_hint')}</p>
      <Input label={t('request.title')} value={form.title} maxLength={200} onChange={e => set('title', e.target.value)} data-testid="request-edit-title" />
      <Input as="textarea" rows={4} label={t('request.description')} value={form.description} maxLength={10000}
        onChange={e => set('description', e.target.value)} data-testid="request-edit-description" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {select('category_id', t('for_you.profession'), categories)}
        {select('service_id', `${t('request.service')} (${t('common.optional')})`, services, { disabled: !form.category_id })}
        {select('city_id', t('location.city'), cities)}
        {select('district_id', t('location.district'), districts, { disabled: !form.city_id || districts.length === 0 })}
      </div>
      <label className="flex items-center gap-2 text-[13.5px] cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-primary" checked={form.is_urgent} onChange={e => set('is_urgent', e.target.checked)} />
        ⚡ {t('request.urgent')}
      </label>
      {error && <p className="text-danger text-[13px] m-0" role="alert">{error}</p>}
      <div className="flex gap-2 flex-wrap">
        <Button variant="primary" loading={saving} disabled={!form.category_id || !form.city_id || needsDistrict} onClick={save} data-testid="request-edit-save">{t('common.save')}</Button>
        <Button variant="outline" onClick={() => setOpen(false)}>{t('admin.cancel_btn')}</Button>
      </div>
      {needsDistrict && <p className="text-[12px] text-fg-muted m-0">{t('auth.simple_district_required')}</p>}
    </div>
  );
}
