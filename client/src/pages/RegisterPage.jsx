import { localizedTerms } from '../utils/localizeTerms';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import usePublicSettings, { csvToList } from '../hooks/usePublicSettings';
import { listCountries, reverseGeocode } from '../services/serviceService';
import useLocationOptions from '../hooks/useLocationOptions';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import LocationPickerMap from '../components/common/LocationPickerMap';
import ServiceVenuePicker from '../components/common/ServiceVenuePicker';
import ProviderServicesPicker from '../components/common/ProviderServicesPicker';
import SafeHtml from '../components/common/SafeHtml';
import { apiError } from '../services/api';
import { localizedName } from '../utils/localize';
import { getCurrentPosition, isValidCoordinates, geoSelection, preserveCoordinatesForAreaChange } from '../utils/geolocation.mjs';
import { internalAuthReturn, authReturnTarget } from '../utils/authReturn';

const IDENTITY_FIELDS = ['username', 'phone', 'email', 'facebook_id'];

export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = internalAuthReturn(location.state?.from);
  const { settings } = usePublicSettings();
  const termsHtml = localizedTerms(settings, lang, t);
  const currencyLabel = country => lang === 'ar'
    ? country.currency_symbol || country.currency_code
    : country.currency_code === 'SAR' ? t('common.currency') : country.currency_code || country.currency_symbol;
  const allowed = csvToList(settings.auth_methods_enabled, 'username,email,phone,facebook');
  const allow = (m) => allowed.includes(m);

  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState(false);

  const [form, setForm] = useState({
    full_name: '', username: '', email: '', phone: '', facebook_id: '', password: '', address: '',
    role: new URLSearchParams(location.search).get('role') === 'provider' ? 'provider' : 'client',
    location_mode: 'mobile', fixed_address: '',
    category_id: '', service_ids: [],
    country_id: '', region_id: '', governorate_id: '', city_id: '', district_id: '',
    latitude: null, longitude: null,
    // A shared invitation link (?ref=CODE) pre-fills the coupon.
    referral_code: (new URLSearchParams(location.search).get('ref') || '').trim().toUpperCase().slice(0, 12),
  });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [identityConflict, setIdentityConflict] = useState(false);
  const identityInputs = useRef({});
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [locMsg, setLocMsg] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  // Where a provider with a fixed place (or both) offers the service; separate from the private account point.
  const [venuePoint, setVenuePoint] = useState(null);
  const [venueMapOpen, setVenueMapOpen] = useState(false);
  const [pointConfirmed, setPointConfirmed] = useState(false);
  const locationRequest = useRef(0);
  const locationController = useRef(null);
  const cancelLocation = useCallback(() => {
    locationRequest.current += 1;
    locationController.current?.abort();
  }, []);
  useEffect(() => cancelLocation, [cancelLocation]);
  const { rows: regions, loading: regionsLoading, error: regionsError } = useLocationOptions('regions', form.country_id);
  const { rows: governorates, loading: governoratesLoading, error: governoratesError } = useLocationOptions('governorates', form.region_id);
  const { rows: cities, loading: citiesLoading, error: citiesError } = useLocationOptions(
    form.governorate_id ? 'cities' : 'regionCities', form.governorate_id || form.region_id,
  );
  const { rows: districts, loading: districtsLoading, error: districtsError } = useLocationOptions('districts', form.city_id);
  const hasPoint = isValidCoordinates(form.latitude, form.longitude);
  const areasLoading = countriesLoading || regionsLoading || governoratesLoading || citiesLoading || districtsLoading;
  const areasUnavailable = countriesError || regionsError || governoratesError || citiesError || districtsError;

  const applyGeoResult = (res, coords) => {
    if (!isValidCoordinates(coords?.lat, coords?.lon)) return false;
    const selection = geoSelection(res);
    setForm((f) => ({
      ...f, latitude: coords.lat, longitude: coords.lon,
      ...(f.latitude === coords.lat && f.longitude === coords.lon && !selection.city ? {} : {
        country_id: selection.country?.id || f.country_id,
        region_id: selection.region?.id || '',
        governorate_id: selection.governorate?.id || '',
        city_id: selection.city?.id || '',
        district_id: selection.district?.id || '',
      }),
    }));
    const label = [selection.country, selection.city, selection.district]
      .filter(Boolean).map(row => localizedName(row, lang)).join(' • ');
    setLocMsg({
      type: selection.city && !res?.best_effort ? 'success' : 'warn',
      text: res?.best_effort ? `${label} • ${t('auth.location_best_effort')}` :
        selection.city ? label : `${label ? `${label} • ` : ''}${t('auth.location_area_unknown')}`,
    });
    return true;
  };

  const activeCountry = useMemo(
    () => countries.find((c) => Number(c.id) === Number(form.country_id)),
    [countries, form.country_id]
  );
  const selectedCity = cities.find(city => Number(city.id) === Number(form.city_id));
  const mapCenter = isValidCoordinates(form.latitude, form.longitude)
    ? { lat: form.latitude, lon: form.longitude }
    : selectedCity?.latitude != null && selectedCity?.longitude != null &&
      isValidCoordinates(Number(selectedCity.latitude), Number(selectedCity.longitude))
      ? { lat: Number(selectedCity.latitude), lon: Number(selectedCity.longitude) } : null;

  // Bootstrap countries list. Default to the first enabled country.
  useEffect(() => {
    let current = true;
    listCountries().then((rows) => {
      if (!current) return;
      setCountries(rows);
      if (!rows.length) setCountriesError(true);
      setForm((f) => f.country_id ? f : { ...f, country_id: rows?.[0]?.id || '' });
    }).catch(() => { if (current) setCountriesError(true); })
      .finally(() => { if (current) setCountriesLoading(false); });
    return () => { current = false; };
  }, []);

  const update = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (fieldErrors[k]) {
      const remainingErrors = { ...fieldErrors };
      delete remainingErrors[k];
      setFieldErrors(remainingErrors);
      setError('');
      if (Object.keys(remainingErrors).length === 0) setIdentityConflict(false);
    } else if (identityConflict && IDENTITY_FIELDS.includes(k) && Object.keys(fieldErrors).length === 0) {
      // Legacy endpoints may return a 409 without structured field errors.
      setIdentityConflict(false);
      setError('');
    }
  };

  const updateServices = values => {
    setForm(previous => ({ ...previous, ...values }));
    setFieldErrors(previous => {
      const { category_id, service_ids, ...remaining } = previous;
      return remaining;
    });
    setError('');
  };

  // Completing an address keeps its chosen pin; replacing an area clears it.
  // Every manual selection cancels late GPS and address responses.
  const changeArea = (values) => {
    cancelLocation();
    setLocating(false);
    setLocMsg(null);
    setPointConfirmed(false);
    setForm(f => ({ ...f, ...values,
      ...(preserveCoordinatesForAreaChange(f, values) ? {} : { latitude: null, longitude: null }),
    }));
  };
  const pickCountry = id => changeArea({ country_id: id, region_id: '', governorate_id: '', city_id: '', district_id: '' });
  const pickRegion = id => changeArea({ region_id: id, governorate_id: '', city_id: '', district_id: '' });
  const pickGovernorate = id => changeArea({ governorate_id: id, city_id: '', district_id: '' });
  const pickCity = id => {
    const city = cities.find(row => Number(row.id) === Number(id));
    changeArea({ city_id: id, governorate_id: city?.governorate_id || '', district_id: '' });
  };

  const useMyLocation = async () => {
    if (!navigator.geolocation) {
      setLocMsg({ type: 'error', text: t('auth.location_unsupported') });
      return;
    }
    cancelLocation();
    const request = locationRequest.current;
    const controller = new AbortController();
    locationController.current = controller;
    setLocating(true);
    setPointConfirmed(false);
    setLocMsg(null);
    let coords;
    try {
      const pos = await getCurrentPosition({ signal: controller.signal, timeoutMs: 10000 });
      if (request !== locationRequest.current || controller.signal.aborted) return;
      coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      // Preserve the actual GPS pair even if the optional address service fails.
      applyGeoResult(null, coords);
      const res = await reverseGeocode({ ...coords, signal: controller.signal });
      if (request === locationRequest.current && !controller.signal.aborted) applyGeoResult(res, coords);
    } catch (err) {
      if (request !== locationRequest.current || controller.signal.aborted) return;
      if (coords) applyGeoResult(null, coords);
      else setLocMsg({ type: 'error', text: t(err.code === 1 ? 'auth.location_denied' : err.code === 3 ? 'auth.location_timeout' : 'auth.location_failed') });
    } finally {
      if (request === locationRequest.current) setLocating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    cancelLocation();
    setLocating(false);
    if (!termsAccepted) {
      setError(t('auth.terms_required'));
      return;
    }
    const errors = {};
    if (form.full_name.trim().length < 2) errors.full_name = t('auth.account_name_required');
    if (!allow('phone')) errors.phone = t('auth.account_phone_unavailable');
    else if (!/^\+?\d{8,15}$/.test(form.phone.trim().replace(/[\s()-]/g, ''))) errors.phone = t('auth.account_phone_required');
    if (form.address.trim().length < 5) errors.address = t('auth.account_address_required');
    if (areasLoading) errors.city_id = t('common.loading');
    else if (areasUnavailable) errors.city_id = t('location.options_unavailable');
    else if (!countries.some(row => Number(row.id) === Number(form.country_id)) ||
      !regions.some(row => Number(row.id) === Number(form.region_id)) ||
      !cities.some(row => Number(row.id) === Number(form.city_id)) ||
      (districts.length > 0 && !districts.some(row => Number(row.id) === Number(form.district_id)))) {
      errors.city_id = t('auth.account_area_required');
    }
    if (!hasPoint) errors.latitude = t('auth.location_point_required');
    else if (!pointConfirmed) errors.latitude = t('auth.location_confirmation_required');
    if (form.role === 'provider') {
      if (!form.category_id) errors.category_id = t('provider.profession_required');
      if (!form.service_ids.length) errors.service_ids = t('provider.services_required');
      if (form.location_mode !== 'mobile' && !venuePoint) errors.venue_point = t('provider.venue_point_required');
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError(Object.values(errors)[0]);
      const firstField = Object.keys(errors)[0];
      document.getElementById(firstField === 'latitude' ? 'register-location-confirmation' : `register-${firstField.replace('_id', '')}`)?.focus();
      return;
    }
    setError('');
    setFieldErrors({});
    setIdentityConflict(false);
    setLoading(true);
    try {
      const { location_mode, fixed_address, category_id, service_ids, ...account } = form;
      const { username, email, facebook_id, ...phoneAccount } = account;
      const res = await register({
        ...(form.role === 'provider' ? phoneAccount : account),
        full_name: form.full_name.trim(), phone: form.phone.trim(), address: form.address.trim(),
        onboarding_version: 1, location_confirmed: pointConfirmed,
        ...(form.role === 'provider' ? {
          location_mode,
          fixed_address: location_mode === 'mobile' ? null : fixed_address.trim() || null,
          ...(location_mode !== 'mobile' && venuePoint ? { fixed_latitude: venuePoint.lat, fixed_longitude: venuePoint.lon } : {}),
          category_id: Number(category_id), service_ids,
        } : {}),
        country_id: form.country_id || null,
        region_id: form.region_id || null,
        governorate_id: form.governorate_id || null,
        city_id: form.city_id || null,
        district_id: form.district_id || null,
        terms_accepted: true,
        terms_version: settings.terms_version || '1.0',
        ...(form.referral_code.trim() ? { referral_code: form.referral_code.trim() } : {}),
      });
      navigate(authReturnTarget(res.user.role, from), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message === 'coupon_not_found' ? t('wallet.errors.coupon_not_found') : apiError(err));
      if (err.response?.status === 409) {
        const conflicts = (Array.isArray(err.response.data?.errors) ? err.response.data.errors : [])
          .filter(item => IDENTITY_FIELDS.includes(item.field) && typeof item.message === 'string');
        setFieldErrors(Object.fromEntries(conflicts.map(item => [item.field, apiError({ ...err, response: { ...err.response, data: { message: item.message, errors: [item] } } })])));
        setIdentityConflict(true);
        const input = conflicts.map(item => identityInputs.current[item.field]).find(Boolean);
        input?.focus();
      }
    } finally { setLoading(false); }
  };

  const dialPrefix = activeCountry?.dial_code || '';
  const phonePlaceholder = dialPrefix ? `${dialPrefix} ...` : '+9665XXXXXXXX';
  const visibleIdentifiers = form.role === 'provider' ? ['phone'] : IDENTITY_FIELDS;
  const loginIdentifier = visibleIdentifiers.find(field => fieldErrors[field] && form[field]) || visibleIdentifiers.find(field => form[field]);
  const loginState = { from, ...(loginIdentifier ? { identifier: form[loginIdentifier] } : {}) };

  return (
    <form onSubmit={handleSubmit} data-testid="register-form">
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0">
      <h2 className="mb-1">{t('auth.register_title')}</h2>
      <p className="text-secondary text-sm mb-4">{t('auth.account_details_hint')}</p>

      {error && (
        <div role="alert" className="form-error mb-3" style={{ background: 'rgba(239,68,68,.1)', padding: 10, borderRadius: 8 }}>
          {error}
        </div>
      )}
      {identityConflict && <div className="text-sm text-secondary mb-3">
        <p>{t('auth.identity_in_use_hint')}</p>
        <Link to="/login" state={loginState}>{t('auth.login_title')}</Link>
      </div>}

      {/* === Account type === */}
      <div className="role-tabs mb-3">
        <button type="button" className={form.role === 'client' ? 'active' : ''}
          onClick={() => update('role', 'client')}>
          🙋 {t('auth.role_client')}
        </button>
        <button type="button" className={form.role === 'provider' ? 'active' : ''}
          onClick={() => update('role', 'provider')}>
          🛠️ {t('auth.role_provider')}
        </button>
      </div>

      <Input id="register-full_name" name="full_name" label={t('auth.full_name')} required minLength={2} maxLength={150}
        autoComplete="name" error={fieldErrors.full_name} value={form.full_name} onChange={(e) => update('full_name', e.target.value)} />

      {form.role === 'provider' && <p className="text-sm text-secondary mb-3">{t('auth.provider_phone_hint')}</p>}
      {!allow('phone') && <div role="alert" className="form-error mb-3">{t('auth.account_phone_unavailable')}</div>}
      {form.role !== 'provider' && allowed.length > 1 && (
        <div className="px-3 py-2 mb-2 rounded-card bg-blue-50 border border-blue-200 text-blue-700 text-[12.5px]">
          💡 {t('auth.identifiers_hint')}
        </div>
      )}
      {form.role !== 'provider' && allow('username') && (
        <Input ref={node => { identityInputs.current.username = node; }} name="username" error={fieldErrors.username} label={t('auth.username')} value={form.username} onChange={(e) => update('username', e.target.value)} placeholder="ahmad95" autoComplete="username" />
      )}
      {form.role !== 'provider' && allow('email') && (
        <Input ref={node => { identityInputs.current.email = node; }} name="email" error={fieldErrors.email} label={t('auth.email')} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="email" />
      )}
      <Input ref={node => { identityInputs.current.phone = node; }} id="register-phone" name="phone" error={fieldErrors.phone}
        label={t('auth.phone')} type="tel" required maxLength={30} dir="ltr" value={form.phone}
        onChange={(e) => update('phone', e.target.value)} autoComplete="tel" placeholder={phonePlaceholder} />
      {form.role !== 'provider' && allow('facebook') && (
        <Input ref={node => { identityInputs.current.facebook_id = node; }} name="facebook_id" error={fieldErrors.facebook_id} label={t('auth.facebook_id')} value={form.facebook_id} onChange={(e) => update('facebook_id', e.target.value)} placeholder="100012345678901" />
      )}

      <PasswordInput label={t('auth.password')} required minLength={4} autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} />

      <Input label={t('wallet.register_coupon')} hint={t('wallet.register_coupon_hint')} dir="ltr" maxLength={12}
        value={form.referral_code} onChange={(e) => update('referral_code', e.target.value.toUpperCase())} placeholder="AB12" />

      {form.role === 'provider' && <div className="mb-4 space-y-4">
        <ProviderServicesPicker categoryId={form.category_id} serviceIds={form.service_ids} onChange={updateServices}
          required disabled={loading} errors={fieldErrors} />
        <ServiceVenuePicker value={form.location_mode} onChange={mode => update('location_mode', mode)} />
        {form.location_mode !== 'mobile' && <div className="space-y-1">
          <Button id="register-venue_point" type="button" variant={venuePoint ? 'outline' : 'primary'} onClick={() => setVenueMapOpen(true)}>
            📍 {venuePoint ? t('provider.venue_point_change') : t('provider.venue_point_pick')}
          </Button>
          {venuePoint && <div className="text-[12px] text-fg-muted">✓ {t('provider.venue_point_set')} <span dir="ltr">{venuePoint.lat.toFixed(5)}, {venuePoint.lon.toFixed(5)}</span></div>}
          {fieldErrors.venue_point && <div className="form-error">{fieldErrors.venue_point}</div>}
        </div>}
        {form.location_mode !== 'mobile' && <Input id="register-fixed-address" name="fixed_address"
          label={t('provider.fixed_address_optional')} value={form.fixed_address} maxLength={255}
          onChange={e => update('fixed_address', e.target.value)} placeholder={t('location.address')}
          hint={t('provider.fixed_address_hint')} />}
      </div>}

      {/* The saved account address is private; provider venues are separate. */}
      <div className="rounded-card p-3 mb-4" style={{ background: 'rgba(14,165,233,.06)', border: '1px solid rgba(14,165,233,.18)' }}>
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="font-bold text-[14px]">📍 {t('auth.your_location')}</div>
          <div className="flex gap-1.5 flex-wrap">
            <button type="button" data-testid="register-use-location" onClick={useMyLocation} disabled={locating || loading}
              className="px-3 py-1.5 rounded-pill text-[12.5px] font-semibold text-primary-fg shadow-soft bg-primary-grad disabled:opacity-60">
              {locating ? '⏳ ' + t('auth.locating') : '📌 ' + t('auth.use_my_location')}
            </button>
            <button type="button" data-testid="register-pick-location" disabled={loading} onClick={() => { cancelLocation(); setLocating(false); setMapOpen(true); }}
              className="px-3 py-1.5 rounded-pill text-[12.5px] font-semibold bg-surface-alt text-fg hover:bg-border transition">
              🗺️ {t('auth.pick_on_map')}
            </button>
          </div>
        </div>
        {locMsg && (
          <div role={locMsg.type === 'error' ? 'alert' : 'status'} className={`text-[12px] mb-2 px-2 py-1 rounded ${
            locMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' :
            locMsg.type === 'warn'    ? 'bg-amber-50 text-amber-700' :
                                         'bg-rose-50 text-rose-700'
          }`}>{locMsg.text}</div>
        )}
        <p className="text-[12px] text-secondary mb-2">{t('auth.location_required_hint')}</p>
        {areasUnavailable && <div role="alert" className="form-error mb-2">{t('location.options_unavailable')}</div>}

        <div className="grid grid-2" style={{ gap: 8 }}>
          {countries.length !== 1 && <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label htmlFor="register-country" className="form-label">{t('location.country')}</label>
            <select id="register-country" name="country_id" className="select" value={form.country_id} required disabled={countriesLoading || loading} onChange={(e) => pickCountry(e.target.value)}>
              <option value="">{t('common.select')}</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.flag_emoji ? `${c.flag_emoji} ` : ''}{localizedName(c, lang)}
                  {c.currency_code || c.currency_symbol ? ` • ${currencyLabel(c)}` : ''}
                </option>
              ))}
            </select>
            {activeCountry && (
              <div className="text-[11px] text-secondary mt-1">
                💱 {t('auth.currency')}: <b>{currencyLabel(activeCountry)}</b>
                {activeCountry.dial_code && <span className="ms-2">📞 {activeCountry.dial_code}</span>}
              </div>
            )}
          </div>}
          <div className="form-group">
            <label htmlFor="register-region" className="form-label">{t('location.region')}</label>
            <select id="register-region" name="region_id" className="select" value={form.region_id} required onChange={(e) => pickRegion(e.target.value)} disabled={loading || !form.country_id || regionsLoading || regions.length === 0}>
              <option value="">{regionsLoading ? t('common.loading') : t('common.select')}</option>
              {regions.map((r) => <option key={r.id} value={r.id}>{localizedName(r, lang)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="register-governorate" className="form-label">{t('location.governorate')}</label>
            <select id="register-governorate" name="governorate_id" className="select" value={form.governorate_id} onChange={(e) => pickGovernorate(e.target.value)} disabled={loading || !form.region_id || governoratesLoading || governorates.length === 0}>
              <option value="">{governoratesLoading ? t('common.loading') : t('common.select')}</option>
              {governorates.map((g) => <option key={g.id} value={g.id}>{localizedName(g, lang)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="register-city" className="form-label">{t('location.city')}</label>
            <select id="register-city" name="city_id" className="select" value={form.city_id} required aria-invalid={fieldErrors.city_id ? true : undefined} onChange={(e) => pickCity(e.target.value)} disabled={loading || citiesLoading || cities.length === 0}>
              <option value="">{citiesLoading ? t('common.loading') : t('common.select')}</option>
              {cities.map((c) => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="register-district" className="form-label">{t('location.district')}</label>
            <select id="register-district" name="district_id" className="select" value={form.district_id} required={districts.length > 0} onChange={(e) => changeArea({ district_id: e.target.value })} disabled={loading || !form.city_id || districtsLoading || districts.length === 0}>
              <option value="">{districtsLoading ? t('common.loading') : districtsError ? t('location.options_unavailable') : form.city_id && districts.length === 0 ? t('location.no_districts') : t('common.select')}</option>
              {districts.map((d) => <option key={d.id} value={d.id}>{localizedName(d, lang)}</option>)}
            </select>
          </div>
        </div>
        <Input id="register-address" name="address" label={t('location.address')} required minLength={5} maxLength={500}
          as="textarea" rows={3} autoComplete="street-address" error={fieldErrors.address} value={form.address}
          onChange={e => { update('address', e.target.value); setPointConfirmed(false); }} hint={t('auth.account_address_hint')} />
        {hasPoint && <div className="text-xs text-secondary mb-2" data-testid="register-coordinates" dir="ltr">
          {form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}
        </div>}
        <label className="flex items-start gap-2 text-[12.5px] leading-relaxed">
          <input id="register-location-confirmation" name="location_confirmed" type="checkbox" checked={pointConfirmed}
            disabled={!hasPoint || loading || locating} onChange={e => setPointConfirmed(e.target.checked)}
            className="mt-1 w-4 h-4 accent-primary shrink-0" />
          <span>{t('auth.location_confirmation')}</span>
        </label>
        {fieldErrors.latitude && <div role="alert" className="form-error mt-1">{fieldErrors.latitude}</div>}
        {form.role === 'provider' && <p className="text-xs text-secondary mt-2">{t('profile.private_account_address')}</p>}
      </div>

      {/* Terms — must be checked. The privacy block (admin may review
          conversations) is the third bullet of the modal text. */}
      <label className="flex items-start gap-2 my-3 cursor-pointer text-[13px] leading-relaxed">
        <input type="checkbox" required checked={termsAccepted}
          onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-1 w-4 h-4 accent-primary shrink-0" />
        <span>
          {t('auth.terms_prefix')}{' '}
          <button type="button" onClick={() => setTermsOpen(true)}
            className="text-primary font-semibold underline underline-offset-2">
            {t('auth.terms_link')}
          </button>
          <br/>
          <span className="text-[11.5px] text-fg-subtle">{t('auth.terms_privacy_note')}</span>
        </span>
      </label>

      <Button type="submit" data-testid="register-submit" block loading={loading} variant="primary" disabled={!termsAccepted || locating || areasLoading || areasUnavailable}>
        {t('auth.register_button')}
      </Button>

      {termsOpen && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => setTermsOpen(false)}>
          <div onClick={(e) => e.stopPropagation()}
            className="bg-surface rounded-card border border-border w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-extrabold text-ink text-[16px]">{t('auth.terms_title')}</h3>
              <button type="button" onClick={() => setTermsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-surface-alt text-fg-muted text-xl leading-none">×</button>
            </div>
            <SafeHtml className="overflow-y-auto p-4 text-[13.5px] leading-[1.85] text-ink"
              html={termsHtml || t('auth.terms_fallback')} />
            <div className="border-t border-border px-4 py-3 flex justify-between gap-2">
              <button type="button" onClick={() => setTermsOpen(false)}
                className="px-4 py-2 rounded-pill bg-surface-alt text-fg-muted text-[13px] font-semibold">
                {t('admin.cancel_btn')}
              </button>
              <button type="button"
                onClick={() => { setTermsAccepted(true); setTermsOpen(false); }}
                className="px-4 py-2 rounded-pill bg-primary text-primary-fg text-[13px] font-bold">
                ✓ {t('auth.terms_accept')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-center mt-4 text-sm text-secondary">
        {t('auth.have_account')} <Link to="/login" state={loginState}>{t('auth.login_title')}</Link>
      </div>
      </fieldset>

      <LocationPickerMap
        open={venueMapOpen}
        initialLat={venuePoint?.lat ?? mapCenter?.lat}
        initialLon={venuePoint?.lon ?? mapCenter?.lon}
        initialPointSelected={!!venuePoint}
        onClose={() => setVenueMapOpen(false)}
        onConfirm={(res) => setVenuePoint({ lat: res.lat, lon: res.lon })}
      />

      <LocationPickerMap
        open={mapOpen}
        initialLat={mapCenter?.lat}
        initialLon={mapCenter?.lon}
        initialPointSelected={hasPoint}
        onClose={() => setMapOpen(false)}
        onConfirm={(res) => { cancelLocation(); setLocating(false); if (applyGeoResult(res, { lat: res.lat, lon: res.lon })) setPointConfirmed(true); }}
      />

      <style>{`
        .role-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .role-tabs button {
          padding: 14px; border: 2px solid var(--border); background: var(--bg-card);
          border-radius: var(--radius); cursor: pointer; font: inherit; transition: var(--transition);
          font-weight: 600; color: var(--text-secondary);
        }
        .role-tabs button.active { border-color: var(--primary); background: rgba(14,165,233,.08); color: var(--primary-dark); }
      `}</style>
    </form>
  );
}
