import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { canRequestService } from '../utils/canRequest';
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

const EMPTY_FORM = { category_id: '', service_id: '', title: '', description: '' };

export default function CreateRequestPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refresh } = useAuth();
  const [params] = useSearchParams();
  const { country } = useCountry();
  const requestLocation = useRequestLocation({ user, params, fallbackCountryId: country?.id });

  // A profession page links here with ?category=<id> already chosen.
  const startForm = () => ({ ...EMPTY_FORM, category_id: params.get('category') || '' });
  const [form, setForm] = useState(startForm);
  const operation = useRef(0);

  useEffect(() => {
    operation.current += 1;
    setForm(startForm()); setError(''); setLoading(false);
    return () => { operation.current += 1; };
  }, [user?.id]);
  useEffect(() => {
    listCategories().then(setCategories).catch(() => {});
  }, []);

  const update = (k, v) => setForm(f => ({ ...f, [k]: v, ...(k === 'category_id' ? { service_id: '' } : {}) }));
  // The sub-service is optional and listed only for the chosen profession.
  const [services, setServices] = useState([]);
  useEffect(() => {
    setServices([]);
    if (form.category_id) listServices(form.category_id).then(rows => setServices(rows || [])).catch(() => {});
  }, [form.category_id]);
  const optional = label => `${label} (${t('common.optional')})`;

  // The only thing a request truly needs is where the service is.
  const locationMissing = !form.category_id ? t('requester.choose_profession') : !requestLocation.ready ? null
    : !requestLocation.city ? t('auth.simple_location_required')
      : requestLocation.districts.length > 0 && !requestLocation.district ? t('auth.simple_district_required') : null;

  const submit = async (e) => {
    e.preventDefault();
    if (loading || !form.category_id || !requestLocation.ready || !requestLocation.city
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
      const created = await createRequest(fd);
      if (locationSnapshot.remember_location && current === operation.current) await refresh();
      if (current === operation.current) navigate(`/requests/${created.id}`);
    } catch (err) {
      if (current === operation.current) setError(apiError(err));
    } finally {
      if (current === operation.current) setLoading(false);
    }
  };

  // A provider-only account works from its requests board.
  if (!canRequestService(user)) return <Navigate to="/provider" replace />;

  return (
    <div className="container page">
      <h2 className="mb-4">{t('request.create_title')}</h2>

      {error && (
        <div className="form-error mb-3" style={{ background: 'rgba(239,68,68,.1)', padding: 10, borderRadius: 8 }}>
          {error}
        </div>
      )}

      <form onSubmit={submit} className="card" style={{ padding: 24 }}>
        {/* Only the profession is required; the sub-service, title and description are
            optional. The area comes from the account, and price and time are agreed in the
            chat with the provider (AYK-041). */}
        <div className="form-group">
          <label className="form-label">{t('requester.profession')} *</label>
          <select className="select" required value={form.category_id} onChange={(e) => update('category_id', e.target.value)} data-testid="request-category">
            <option value="">{t('common.select')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {localizedName(c, lang)}</option>)}
          </select>
        </div>

        {services.length > 0 && <div className="form-group">
          <label className="form-label">{optional(t('requester.sub_service'))}</label>
          <select className="select" value={form.service_id} onChange={(e) => update('service_id', e.target.value)} data-testid="request-service">
            <option value="">{t('common.select')}</option>
            {services.map(s => <option key={s.id} value={s.id}>{localizedName(s, lang)}</option>)}
          </select>
        </div>}

        <Input
          label={optional(t('requester.request_title'))}
          value={form.title}
          maxLength={200}
          onChange={(e) => update('title', e.target.value)}
          placeholder={t('requester.request_title_ph')}
          data-testid="request-title"
        />

        <Input
          as="textarea"
          label={optional(t('request.description'))}
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder={t('request.description_ph')}
        />

        <RequestLocationFields control={requestLocation} disabled={loading} />


        <Button type="submit" block size="lg" loading={loading} variant="primary" disabled={!requestLocation.ready || !!locationMissing}>
          {t('request.submit')}
        </Button>
        {locationMissing && <p className="text-center text-[12px] text-fg-muted mt-1">{t('auth.complete_to_enable', { item: locationMissing })}</p>}
      </form>
    </div>
  );
}
