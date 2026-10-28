import { useState, useEffect, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { canRequestService } from '../utils/canRequest';
import { useTranslation } from 'react-i18next';
import { listCategories } from '../services/serviceService';
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

const EMPTY_FORM = { description: '', category_id: '' };

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

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // The only thing a request truly needs is where the service is.
  const locationMissing = !requestLocation.ready ? null
    : !requestLocation.city ? t('auth.simple_location_required')
      : requestLocation.districts.length > 0 && !requestLocation.district ? t('auth.simple_district_required') : null;

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
        {/* Only the profession and a few words; the area comes from the account. Price,
            time and details are agreed in the chat with the provider. */}
        <div className="form-group">
          <label className="form-label">{t('request.category')}</label>
          <select className="select" value={form.category_id} onChange={(e) => update('category_id', e.target.value)} data-testid="request-category">
            <option value="">{t('common.select')}</option>
            {categories.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
          </select>
        </div>

        <Input
          as="textarea"
          label={t('request.description')}
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
