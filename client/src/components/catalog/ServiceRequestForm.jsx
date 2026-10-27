import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import RequestLocationFields from '../common/RequestLocationFields';
import { useAuth } from '../../hooks/useAuth';
import useRequestLocation from '../../hooks/useRequestLocation';
import { requestLocationFields, appendRequestLocation } from '../../utils/requestLocation';
import { createRequest } from '../../services/requestService';
import { apiError } from '../../services/api';
import { tx } from '../../utils/localize';

const EMPTY = { desc: '', preferredTime: '', notes: '' };
export default function ServiceRequestForm({ service, open, onClose }) {
  const { t, i18n } = useTranslation();
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const locationQuery = params.toString();
  const lang = i18n.resolvedLanguage || 'ar';
  const requestLocation = useRequestLocation({ user, params, enabled: open && Boolean(user), fallbackCountryId: user?.country_id });
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const operation = useRef(0);
  useEffect(() => {
    operation.current += 1;
    setCreated(null); setForm(EMPTY); setFiles([]); setError(''); setLoading(false);
  }, [open, user?.id, service?.id]);
  useEffect(() => () => { operation.current += 1; }, []);

  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const close = () => {
    if (loading) return;
    operation.current += 1;
    setCreated(null); setForm(EMPTY); setFiles([]); setError(''); onClose?.();
  };
  const submit = async event => {
    event.preventDefault();
    if (!user || loading || !requestLocation.ready || !requestLocation.city
        || (requestLocation.districts.length > 0 && !requestLocation.district)) return;
    const current = ++operation.current;
    const locationSnapshot = requestLocationFields(requestLocation.location, requestLocation.remember);
    setLoading(true); setError('');
    try {
      const data = new FormData();
      data.append('title', tx(service.title, lang));
      data.append('description', [form.desc.trim(), form.notes.trim()].filter(Boolean).join('\n\n'));
      appendRequestLocation(data, locationSnapshot);
      // These initial service types match the seeded PostgreSQL catalog.
      if (service.categoryId) data.append('category_id', service.categoryId);
      data.append('service_id', service.id);
      if (form.preferredTime) data.append('preferred_date', form.preferredTime);
      files.forEach(file => data.append('files', file));
      const result = await createRequest(data);
      if (locationSnapshot.remember_location && current === operation.current) await refresh();
      if (current === operation.current) setCreated(result);
    } catch (err) { if (current === operation.current) setError(apiError(err)); }
    finally { if (current === operation.current) setLoading(false); }
  };
  if (!service) return null;
  return <Modal open={open} onClose={close} title={`${t('catalog.order_form_title')} — ${tx(service.title, lang)}`} width={560}>
    {!user ? <div className="space-y-4 text-center py-5"><p>{t('catalog.login_to_order')}</p><Link className="btn btn-primary" to="/login" state={{ from: `/services/${service.id}${locationQuery ? `?${locationQuery}` : ''}` }}>{t('auth.login_button')}</Link></div>
    : created ? <div className="text-center py-6"><div className="text-5xl mb-3">✅</div><p className="font-bold">{t('catalog.order_success')}</p><Link to={`/requests/${created.id}`} className="btn btn-primary mt-4">{t('request.details_title')}</Link></div>
    : <form onSubmit={submit}>
      {error && <div role="alert" className="form-error mb-3">{error}</div>}
      <RequestLocationFields control={requestLocation} prefix="catalog" disabled={loading} />
      <Input as="textarea" label={t('catalog.request_desc')} required minLength={8} maxLength={8000} value={form.desc} onChange={event => set('desc', event.target.value)} />
      <div className="form-group"><label className="form-label" htmlFor="catalog-files">{t('catalog.upload_images')}</label><input id="catalog-files" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => setFiles(Array.from(event.target.files || []).slice(0, 5))} />{files.length > 0 && <div className="text-xs text-muted mt-1">{t('request.files_count', { count: files.length })}</div>}</div>
      <Input label={t('catalog.preferred_time')} type="datetime-local" value={form.preferredTime} onChange={event => set('preferredTime', event.target.value)} />
      <Input as="textarea" label={t('catalog.notes')} maxLength={1000} value={form.notes} onChange={event => set('notes', event.target.value)} />
      <Button type="submit" block variant="primary" loading={loading} disabled={!requestLocation.ready || !requestLocation.city || (requestLocation.districts.length > 0 && !requestLocation.district)}>{t('catalog.send_order')}</Button>
    </form>}
  </Modal>;
}
