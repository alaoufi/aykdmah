import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { listCategories, listServices } from '../services/serviceService';
import { createRequest } from '../services/requestService';
import { useAuth } from '../hooks/useAuth';
import useRequestLocation from '../hooks/useRequestLocation';
import { requestLocationFields, appendRequestLocation } from '../utils/requestLocation';
import useCountry from '../hooks/useCountry';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import RequestLocationFields from '../components/common/RequestLocationFields';
import { apiError } from '../services/api';
import { localizedName } from '../utils/localize';

const EMPTY_FORM = {
  title: '', description: '', category_id: '', service_id: '',
  budget_min: '', budget_max: '', preferred_date: '', is_urgent: false,
};

export default function CreateRequestPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const { country } = useCountry();
  const requestLocation = useRequestLocation({ user, params, fallbackCountryId: country?.id });

  const [form, setForm] = useState(EMPTY_FORM);
  const operation = useRef(0);

  useEffect(() => {
    operation.current += 1;
    setForm(EMPTY_FORM); setFiles([]); setError(''); setLoading(false);
    return () => { operation.current += 1; };
  }, [user?.id]);
  useEffect(() => {
    listCategories().then(setCategories).catch(() => {});
  }, []);


  useEffect(() => {
    let current = true;
    setServices([]);
    if (form.category_id) listServices(form.category_id).then(rows => { if (current) setServices(rows); }).catch(() => {});
    return () => { current = false; };
  }, [form.category_id]);

  const update = (k, v) => setForm(f => ({
    ...f,
    ...(k === 'category_id' ? { service_id: '' } : {}),
    [k]: v,
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (loading || !requestLocation.ready || !requestLocation.city
        || (requestLocation.districts.length > 0 && !requestLocation.district)) return;
    const current = ++operation.current;
    const locationSnapshot = requestLocationFields(requestLocation.location, requestLocation.remember);
    setError('');
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v !== null && v !== undefined) fd.append(k, v);
      });
      appendRequestLocation(fd, locationSnapshot);
      files.forEach(f => fd.append('files', f));
      const created = await createRequest(fd);
      if (locationSnapshot.remember_location && current === operation.current) await refresh();
      if (current === operation.current) navigate(`/requests/${created.id}`);
    } catch (err) {
      if (current === operation.current) setError(apiError(err));
    } finally {
      if (current === operation.current) setLoading(false);
    }
  };

  return (
    <div className="container page">
      <h2 className="mb-4">{t('request.create_title')}</h2>

      {error && (
        <div className="form-error mb-3" style={{ background: 'rgba(239,68,68,.1)', padding: 10, borderRadius: 8 }}>
          {error}
        </div>
      )}

      <form onSubmit={submit} className="card" style={{ padding: 24 }}>
        <Input
          label={`${t('request.title')} *`}
          required maxLength={200}
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          placeholder={t('request.title_ph')}
        />

        <Input
          as="textarea"
          label={`${t('request.description')} *`}
          required minLength={10}
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder={t('request.description_ph')}
        />

        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">{t('request.category')}</label>
            <select className="select" value={form.category_id} onChange={(e) => update('category_id', e.target.value)}>
              <option value="">{t('common.select')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">{t('request.subservice')}</label>
            <select className="select" value={form.service_id} onChange={(e) => update('service_id', e.target.value)} disabled={!form.category_id}>
              <option value="">{t('common.select')}</option>
              {services.map(s => <option key={s.id} value={s.id}>{localizedName(s, lang)}</option>)}
            </select>
          </div>
        </div>

        <RequestLocationFields control={requestLocation} disabled={loading} />

        <div className="grid grid-2">
          <Input
            label={`${t('request.budget_min')} (${t('common.currency')})`}
            type="number" min="0"
            value={form.budget_min}
            onChange={(e) => update('budget_min', e.target.value)}
          />
          <Input
            label={`${t('request.budget_max')} (${t('common.currency')})`}
            type="number" min="0"
            value={form.budget_max}
            onChange={(e) => update('budget_max', e.target.value)}
          />
        </div>

        <Input
          label={t('request.preferred_time')}
          type="datetime-local"
          value={form.preferred_date}
          onChange={(e) => update('preferred_date', e.target.value)}
        />

        <div className="form-group">
          <label className="form-label">{t('request.attachments_full')}</label>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 8))}
          />
          {files.length > 0 && <div className="text-xs text-muted mt-1">{t('request.files_count', { count: files.length })}</div>}
        </div>

        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={form.is_urgent}
            onChange={(e) => update('is_urgent', e.target.checked)}
          />
          <span>{t('request.urgent_full')}</span>
        </label>

        <Button type="submit" block size="lg" loading={loading} variant="primary" disabled={!requestLocation.ready || !requestLocation.city || (requestLocation.districts.length > 0 && !requestLocation.district)}>
          {t('request.submit')}
        </Button>
      </form>
    </div>
  );
}
