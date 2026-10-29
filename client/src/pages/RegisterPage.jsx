import { localizedTerms } from '../utils/localizeTerms';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import usePublicSettings from '../hooks/usePublicSettings';
import { reverseGeocode, listCountries } from '../services/serviceService';
import { sendPhoneCode, checkPhone } from '../services/authService';
import { cleanPhone, isSaudiMobile } from '../utils/saudiPhone';
import useLocationOptions from '../hooks/useLocationOptions';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import LocationPickerMap from '../components/common/LocationPickerMap';
import ServiceVenuePicker from '../components/common/ServiceVenuePicker';
import ProfessionsPicker from '../components/common/ProfessionsPicker';
import CoverageDistrictsPicker from '../components/common/CoverageDistrictsPicker';
import { weekdayName } from '../components/common/AvailabilityBadge';
import SafeHtml from '../components/common/SafeHtml';
import { apiError } from '../services/api';
import { localizedName } from '../utils/localize';
import { getCurrentPosition, isValidCoordinates, geoSelection } from '../utils/geolocation.mjs';
import { internalAuthReturn, authReturnTarget } from '../utils/authReturn';

const ROLES = [
  { key: 'client', icon: '🙋', label: 'auth.role_client' },
  { key: 'provider', icon: '🛠️', label: 'auth.role_provider' },
  { key: 'both', icon: '🔁', label: 'auth.role_both' },
];

// Simplified sign-up (onboarding version 2): phone, password, an optional
// name and the device location. Providers add professions and coverage.
export default function RegisterPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const from = internalAuthReturn(location.state?.from);
  const { settings } = usePublicSettings();
  const termsHtml = localizedTerms(settings, lang, t);

  const [form, setForm] = useState({
    role: ['provider', 'both'].includes(params.get('role')) ? params.get('role') : 'client',
    phone: '', password: '', full_name: '',
    service_ids: [], coverage: [], location_mode: 'mobile',
    work_days: [0, 1, 2, 3, 4, 5, 6], work_from: '', work_to: '',
    // A shared invitation link (?ref=CODE) pre-fills the coupon.
    referral_code: (params.get('ref') || '').trim().toUpperCase().slice(0, 12),
  });
  const [place, setPlace] = useState({ lat: null, lon: null, region_id: '', governorate_id: '', city_id: '', district_id: '', label: '' });
  const [locStatus, setLocStatus] = useState('idle');
  const [mapOpen, setMapOpen] = useState(false);
  const [venuePoint, setVenuePoint] = useState(null);
  const [venueMapOpen, setVenueMapOpen] = useState(false);
  const [couponOpen, setCouponOpen] = useState(Boolean(params.get('ref')));
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [coverageCount, setCoverageCount] = useState(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  // '' | 'checking' | 'available' | 'taken' — checked when the phone field loses focus.
  const [phoneStatus, setPhoneStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [welcome, setWelcome] = useState(null);
  const [copied, setCopied] = useState(false);
  // Phone code step: shown only when an SMS provider is active (AYK-016).
  const [codeStep, setCodeStep] = useState(null);
  const [phoneCode, setPhoneCode] = useState('');
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait(value => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);
  const locationController = useRef(null);
  const isProvider = form.role !== 'client';
  // A requester signs up with the phone alone; the SMS code proves it (AYK-041).
  // Without SMS on the site a password is asked for, as the only way back in.
  const [needPassword, setNeedPassword] = useState(false);
  const askPassword = isProvider || needPassword;

  // Area lists are only needed when the device location did not resolve them.
  const [countryId, setCountryId] = useState('');
  useEffect(() => { listCountries().then(rows => setCountryId(rows?.[0]?.id || '')).catch(() => {}); }, []);
  const { rows: regions } = useLocationOptions('regions', countryId, Boolean(place.lat) && !place.city_id);
  const { rows: cities } = useLocationOptions('regionCities', place.region_id, Boolean(place.region_id));
  const { rows: districts } = useLocationOptions('districts', place.city_id);
  const districtMissing = place.city_id && !place.district_id && districts.length > 0;

  const update = (key, value) => {
    if (key === 'phone') { setCodeStep(null); setPhoneCode(''); setPhoneStatus(''); }
    setForm(previous => ({ ...previous, [key]: value }));
    setFieldErrors(previous => { const { [key]: _removed, ...rest } = previous; return rest; });
    setError('');
  };

  const applyGeo = useCallback((res, coords) => {
    const selection = geoSelection(res);
    setPlace({
      lat: coords.lat, lon: coords.lon,
      region_id: selection.region?.id || '', governorate_id: selection.governorate?.id || '',
      city_id: selection.city?.id || '', district_id: selection.district?.id || '',
      label: [selection.district, selection.city].filter(Boolean).map(row => localizedName(row, lang)).join('، '),
    });
    setLocStatus('ok');
    setFieldErrors(previous => { const { location: _removed, ...rest } = previous; return rest; });
  }, [lang]);

  const locate = useCallback(async () => {
    if (!navigator.geolocation) { setLocStatus('failed'); return; }
    locationController.current?.abort();
    const controller = new AbortController();
    locationController.current = controller;
    setLocStatus('locating');
    try {
      const pos = await getCurrentPosition({ signal: controller.signal, timeoutMs: 10000 });
      const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const res = await reverseGeocode({ ...coords, signal: controller.signal }).catch(() => null);
      if (!controller.signal.aborted) applyGeo(res, coords);
    } catch (err) {
      if (!controller.signal.aborted) setLocStatus(err?.code === 1 ? 'denied' : 'failed');
    }
  }, [applyGeo]);

  // The location is taken automatically when the page opens.
  useEffect(() => { locate(); return () => locationController.current?.abort(); }, [locate]);

  // A provider's own neighbourhood is a sensible first coverage choice.
  useEffect(() => {
    if (isProvider && place.district_id && form.coverage.length === 0) update('coverage', [Number(place.district_id)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProvider, place.district_id]);

  const verifyPhone = async () => {
    const value = cleanPhone(form.phone);
    if (!value) return;
    if (!isSaudiMobile(value)) { setFieldErrors(previous => ({ ...previous, phone: t('auth.phone_invalid') })); return; }
    setPhoneStatus('checking');
    try {
      const result = await checkPhone(value);
      if (result?.available === false) {
        setPhoneStatus('taken');
        setFieldErrors(previous => ({ ...previous, phone: t('auth.phone_registered') }));
      } else setPhoneStatus(result?.valid ? 'available' : '');
    } catch (_) { setPhoneStatus(''); }
  };

  // Every rule the account needs; the submit button stays off until none is left.
  const formErrors = () => {
    const errors = {};
    const phone = cleanPhone(form.phone);
    if (!isSaudiMobile(phone)) errors.phone = t('auth.phone_invalid');
    else if (phoneStatus === 'taken') errors.phone = t('auth.phone_registered');
    if (askPassword && form.password.length < 4) errors.password = t('auth.password_min');
    if (form.full_name.trim() && form.full_name.trim().length < 2) errors.full_name = t('auth.account_name_required');
    if (!isValidCoordinates(place.lat, place.lon) || !place.city_id) errors.location = t('auth.simple_location_required');
    else if (districtMissing) errors.location = t('auth.simple_district_required');
    if (isProvider) {
      if (!form.service_ids.length) errors.service_ids = t('provider.professions_required');
      if (coverageCount > 0 && !form.coverage.length) errors.coverage = t('provider.coverage_required');
      if (form.location_mode !== 'mobile' && !venuePoint) errors.venue_point = t('provider.venue_point_required');
      if (!form.work_days.length) errors.work_time = t('availability.days_required');
      else if (Boolean(form.work_from) !== Boolean(form.work_to)) errors.work_time = t('availability.hours_both');
    }
    if (!termsAccepted) errors.terms = t('auth.terms_required');
    if (codeStep && phoneCode.length < codeStep.length) errors.code = t('auth.code_required');
    return errors;
  };
  const pending = Object.values(formErrors());
  const canSubmit = pending.length === 0 && phoneStatus !== 'checking' && locStatus !== 'locating';

  const handleSubmit = async event => {
    event.preventDefault();
    const phone = cleanPhone(form.phone);
    const errors = formErrors();
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError(Object.values(errors)[0]);
      return;
    }
    setLoading(true);
    setError('');
    if (!codeStep) {
      try {
        const sent = await sendPhoneCode(phone, 'signup');
        if (sent?.required) {
          setCodeStep({ length: sent.length || 4 });
          setWait(sent.resend_seconds || 60);
          setLoading(false);
          return;
        }
        if (!askPassword) {
          setNeedPassword(true);
          setFieldErrors({ password: t('auth.password_min') });
          setLoading(false);
          return;
        }
      } catch (err) {
        setError(apiError(err));
        if ([400, 409].includes(err.response?.status)) setFieldErrors({ phone: apiError(err) });
        setLoading(false);
        return;
      }
    } else if (phoneCode.length < codeStep.length) {
      setError(t('auth.code_required'));
      setLoading(false);
      return;
    }
    try {
      const res = await register({
        ...(codeStep ? { phone_code: phoneCode } : {}),
        onboarding_version: 2, role: form.role, phone, ...(askPassword ? { password: form.password } : {}),
        ...(form.full_name.trim() ? { full_name: form.full_name.trim() } : {}),
        latitude: place.lat, longitude: place.lon,
        region_id: place.region_id || null, governorate_id: place.governorate_id || null,
        city_id: place.city_id, district_id: place.district_id || null,
        ...(isProvider ? {
          service_ids: form.service_ids, coverage_district_ids: form.coverage, location_mode: form.location_mode,
          work_days: form.work_days, ...(form.work_from && form.work_to ? { work_from: form.work_from, work_to: form.work_to } : {}),
          ...(form.location_mode !== 'mobile' && venuePoint ? { fixed_latitude: venuePoint.lat, fixed_longitude: venuePoint.lon } : {}),
        } : {}),
        terms_accepted: true, terms_version: settings.terms_version || '1.0',
        ...(form.referral_code.trim() ? { referral_code: form.referral_code.trim() } : {}),
      });
      if (res.referral_code) setWelcome({ code: res.referral_code, role: res.user.role });
      else navigate(authReturnTarget(res.user.role, from), { replace: true });
    } catch (err) {
      setError(err.response?.data?.message === 'coupon_not_found' ? t('auth.invite_not_found') : apiError(err));
      if (err.response?.status === 409) setFieldErrors({ phone: apiError(err) });
    } finally { setLoading(false); }
  };

  if (welcome) {
    const copy = async () => {
      try { await navigator.clipboard.writeText(welcome.code); setCopied(true); } catch (_) { setCopied(false); }
    };
    return (
      <div className="text-center space-y-3" data-testid="register-welcome">
        <div className="text-4xl">🎉</div>
        <h2>{t('auth.welcome_title')}</h2>
        <p className="text-sm text-secondary">{t(welcome.role === 'client' ? 'auth.welcome_number_hint_client' : 'auth.welcome_coupon_hint')}</p>
        <div className="rounded-card border-2 border-dashed border-primary bg-primary-soft py-4">
          <div className="text-xs text-secondary mb-1">{t('auth.welcome_coupon_title')}</div>
          <div className="text-3xl font-extrabold tracking-[.2em]" dir="ltr">{welcome.code}</div>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" block onClick={copy}>{copied ? `✓ ${t('auth.copied')}` : `📋 ${t('auth.copy')}`}</Button>
          <Button type="button" variant="primary" block onClick={() => navigate(authReturnTarget(welcome.role, from), { replace: true })}>{t('auth.continue')}</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} data-testid="register-form" noValidate>
      <fieldset disabled={loading} className="min-w-0 border-0 p-0 m-0 space-y-3">
        <h2 className="mb-0">{t('auth.register_title')}</h2>

        {error && <div role="alert" className="form-error" style={{ background: 'rgba(239,68,68,.1)', padding: 8, borderRadius: 8 }}>{error}</div>}

        <div className="role-tabs" role="radiogroup" aria-label={t('auth.account_type')}>
          {ROLES.map(role => (
            <button key={role.key} type="button" role="radio" aria-checked={form.role === role.key}
              className={form.role === role.key ? 'active' : ''} onClick={() => update('role', role.key)}>
              <span className="block text-lg leading-none mb-1">{role.icon}</span>{t(role.label)}
            </button>
          ))}
        </div>
        {form.role === 'both' && <p className="text-xs text-secondary -mt-1">{t('auth.role_both_hint')}</p>}

        <Input id="register-phone" name="phone" label={t('auth.phone')} type="tel" required maxLength={30} dir="ltr"
          value={form.phone} error={fieldErrors.phone} autoComplete="tel" inputMode="tel" placeholder="05XXXXXXXX"
          hint={phoneStatus === 'available' ? t('auth.phone_available') : phoneStatus === 'checking' ? '…' : undefined}
          onBlur={verifyPhone} onChange={e => update('phone', e.target.value)} />
        {phoneStatus === 'taken' && (
          <div className="flex gap-4 text-[13px] -mt-2">
            <Link to="/login" state={{ identifier: cleanPhone(form.phone) }} className="text-primary font-semibold">{t('auth.login_button')}</Link>
            <Link to="/forgot-password" state={{ identifier: cleanPhone(form.phone) }} className="text-primary font-semibold">{t('auth.forgot_password')}</Link>
          </div>
        )}
        {askPassword ? <PasswordInput label={t('auth.password')} required minLength={4} autoComplete="new-password"
          value={form.password} error={fieldErrors.password} onChange={e => update('password', e.target.value)} />
          : <p className="text-xs text-secondary -mt-1" data-testid="register-no-password">🔐 {t('requester.no_password_hint')}</p>}
        <Input id="register-full_name" name="full_name" label={t('auth.name_optional')} maxLength={150}
          autoComplete="name" value={form.full_name} error={fieldErrors.full_name} onChange={e => update('full_name', e.target.value)} />

        {/* Location: automatic, with the map as the fallback. */}
        <div className="rounded-card border border-border px-3 py-2" data-testid="register-location">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13.5px] min-w-0">
              {locStatus === 'locating' ? <span role="status">⏳ {t('auth.locating')}</span> :
                locStatus === 'ok' ? <span>📍 {place.label || t('auth.simple_location_set')}</span> :
                <span className="text-amber-700">📍 {t(locStatus === 'denied' ? 'auth.location_denied' : 'auth.simple_location_pick')}</span>}
            </div>
            <div className="flex gap-1 shrink-0">
              {locStatus !== 'locating' && locStatus !== 'ok' && <button type="button" onClick={locate}
                className="px-2.5 py-1 rounded-pill text-[12px] font-semibold bg-surface-alt">{t('auth.retry')}</button>}
              <button type="button" onClick={() => { locationController.current?.abort(); setMapOpen(true); }}
                className="px-2.5 py-1 rounded-pill text-[12px] font-semibold bg-surface-alt">🗺️ {locStatus === 'ok' ? t('auth.location_change') : t('auth.pick_on_map')}</button>
            </div>
          </div>
          {place.lat && !place.city_id && <div className="grid grid-cols-2 gap-2 mt-2">
            <select className="select" aria-label={t('location.region')} value={place.region_id}
              onChange={e => setPlace(previous => ({ ...previous, region_id: e.target.value, city_id: '', district_id: '' }))}>
              <option value="">{t('location.region')}</option>
              {regions.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
            </select>
            <select className="select" aria-label={t('location.city')} value={place.city_id} disabled={!place.region_id}
              onChange={e => setPlace(previous => ({ ...previous, city_id: e.target.value, district_id: '' }))}>
              <option value="">{t('location.city')}</option>
              {cities.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
            </select>
          </div>}
          {districtMissing && <select className="select mt-2" aria-label={t('location.district')} value={place.district_id}
            onChange={e => setPlace(previous => ({ ...previous, district_id: e.target.value }))}>
            <option value="">{t('auth.simple_choose_district')}</option>
            {districts.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
          </select>}
          {fieldErrors.location && <p role="alert" className="form-error mt-1">{fieldErrors.location}</p>}
        </div>

        {isProvider && <>
          <ProfessionsPicker serviceIds={form.service_ids} onChange={ids => update('service_ids', ids)} error={fieldErrors.service_ids} />
          <CoverageDistrictsPicker cityId={place.city_id} value={form.coverage} onChange={ids => update('coverage', ids)}
            error={fieldErrors.coverage} onDistrictsLoaded={setCoverageCount} />
          <fieldset className="border-0 p-0 m-0 min-w-0" data-testid="register-work-time">
            <legend className="form-label">🗓️ {t('work.register_title')}</legend>
            <p className="text-xs text-muted mb-2">{t('work.register_hint')}</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[0, 1, 2, 3, 4, 5, 6].map(day => {
                const active = form.work_days.includes(day);
                return <button key={day} type="button" aria-pressed={active}
                  onClick={() => update('work_days', active ? form.work_days.filter(value => value !== day) : [...form.work_days, day].sort())}
                  className={`px-2.5 py-1 rounded-pill border text-[12.5px] ${active ? 'border-primary bg-primary-soft font-semibold' : 'border-border bg-surface-alt text-fg-muted'}`}>
                  {weekdayName(day, lang)}</button>;
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[12px] text-fg-muted">{t('availability.from')}
                <input type="time" className="input mt-0.5" value={form.work_from} onChange={e => update('work_from', e.target.value)} /></label>
              <label className="text-[12px] text-fg-muted">{t('availability.to')}
                <input type="time" className="input mt-0.5" value={form.work_to} onChange={e => update('work_to', e.target.value)} /></label>
            </div>
            {fieldErrors.work_time && <p role="alert" className="form-error mt-1">{fieldErrors.work_time}</p>}
          </fieldset>
          <ServiceVenuePicker value={form.location_mode} onChange={mode => update('location_mode', mode)} />
          {form.location_mode !== 'mobile' && <div>
            <Button id="register-venue_point" type="button" variant={venuePoint ? 'outline' : 'primary'} onClick={() => setVenueMapOpen(true)}>
              📍 {venuePoint ? t('provider.venue_point_change') : t('provider.venue_point_pick')}
            </Button>
            {venuePoint && <div className="text-[12px] text-fg-muted mt-1">✓ {t('provider.venue_point_set')} <span dir="ltr">{venuePoint.lat.toFixed(5)}, {venuePoint.lon.toFixed(5)}</span></div>}
            {fieldErrors.venue_point && <div className="form-error">{fieldErrors.venue_point}</div>}
          </div>}
        </>}

        {couponOpen ? <Input label={t('auth.invite_label')} hint={t('auth.invite_hint')} dir="ltr" maxLength={12}
          value={form.referral_code} onChange={e => update('referral_code', e.target.value.toUpperCase())} placeholder="AB12" /> :
          <button type="button" className="text-[13px] text-primary font-semibold" onClick={() => setCouponOpen(true)}>🎟️ {t('auth.have_coupon')}</button>}

        <label className="flex items-start gap-2 cursor-pointer text-[13px] leading-relaxed">
          <input type="checkbox" checked={termsAccepted} onChange={e => { setTermsAccepted(e.target.checked); setFieldErrors(({ terms: _t, ...rest }) => rest); }}
            className="mt-1 w-4 h-4 accent-primary shrink-0" />
          <span>
            {t('auth.terms_prefix')}{' '}
            <button type="button" onClick={() => setTermsOpen(true)} className="text-primary font-semibold underline underline-offset-2">{t('auth.terms_link')}</button>
          </span>
        </label>

        {codeStep && <div className="rounded-card border-2 border-primary px-3 py-2 space-y-2" data-testid="register-code">
          <p className="text-[13px] m-0">{t('auth.code_sent_to', { phone: form.phone })}</p>
          <Input id="register-code" label={t('auth.verification_code')} dir="ltr" inputMode="numeric" autoComplete="one-time-code" autoFocus
            maxLength={codeStep.length} placeholder={'1234567890'.slice(0, codeStep.length)} value={phoneCode}
            className="text-center tracking-[.5em] font-mono" onChange={e => { setPhoneCode(cleanPhone(e.target.value).replace(/\D/g, '')); setError(''); }} />
          <div className="flex justify-between text-[13px]">
            <button type="button" className="text-primary font-semibold" onClick={() => { setCodeStep(null); setPhoneCode(''); document.getElementById('register-phone')?.focus(); }}>{t('auth.change_phone')}</button>
            <button type="button" className="text-primary font-semibold disabled:opacity-50" disabled={wait > 0 || loading}
              onClick={async () => { try { const sent = await sendPhoneCode(cleanPhone(form.phone), 'signup'); setWait(sent?.resend_seconds || 60); setError(''); } catch (err) { setError(apiError(err)); } }}>
              {wait > 0 ? t('auth.resend_in', { seconds: wait }) : t('auth.resend_code')}
            </button>
          </div>
        </div>}

        <Button type="submit" data-testid="register-submit" block loading={loading} variant="primary" disabled={!canSubmit}>
          {codeStep ? t('auth.confirm_and_register') : t('auth.register_button')}
        </Button>
        {!canSubmit && pending.length > 0 && <p className="text-center text-[12px] text-fg-muted -mt-1" data-testid="register-pending">{t('auth.complete_to_enable', { item: pending[0] })}</p>}
        <p className="text-center text-[11.5px] text-fg-subtle">{t('auth.sms_later_note')}</p>

        <div className="text-center text-sm text-secondary">
          {t('auth.have_account')} <Link to="/login" state={{ from, ...(form.phone ? { identifier: form.phone } : {}) }}>{t('auth.login_title')}</Link>
        </div>
      </fieldset>

      {termsOpen && (
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/50 p-4" onClick={() => setTermsOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="bg-surface rounded-card border border-border w-full max-w-[640px] max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-extrabold text-ink text-[16px]">{t('auth.terms_title')}</h3>
              <button type="button" onClick={() => setTermsOpen(false)} className="w-8 h-8 rounded-full hover:bg-surface-alt text-fg-muted text-xl leading-none">×</button>
            </div>
            <SafeHtml className="overflow-y-auto p-4 text-[13.5px] leading-[1.85] text-ink" html={termsHtml || t('auth.terms_fallback')} />
            <div className="border-t border-border px-4 py-3 flex justify-between gap-2">
              <button type="button" onClick={() => setTermsOpen(false)} className="px-4 py-2 rounded-pill bg-surface-alt text-fg-muted text-[13px] font-semibold">{t('admin.cancel_btn')}</button>
              <button type="button" onClick={() => { setTermsAccepted(true); setTermsOpen(false); }}
                className="px-4 py-2 rounded-pill bg-primary text-primary-fg text-[13px] font-bold">✓ {t('auth.terms_accept')}</button>
            </div>
          </div>
        </div>
      )}

      <LocationPickerMap open={venueMapOpen} initialLat={venuePoint?.lat ?? place.lat} initialLon={venuePoint?.lon ?? place.lon}
        initialPointSelected={!!venuePoint} onClose={() => setVenueMapOpen(false)}
        onConfirm={res => setVenuePoint({ lat: res.lat, lon: res.lon })} />
      <LocationPickerMap open={mapOpen} initialLat={place.lat} initialLon={place.lon} initialPointSelected={isValidCoordinates(place.lat, place.lon)}
        onClose={() => setMapOpen(false)} onConfirm={res => applyGeo(res, { lat: res.lat, lon: res.lon })} />

      <style>{`
        .role-tabs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
        .role-tabs button {
          padding: 8px 4px; border: 2px solid var(--border); background: var(--bg-card);
          border-radius: var(--radius); cursor: pointer; font: inherit; font-size: 13px; transition: var(--transition);
          font-weight: 600; color: var(--text-secondary);
        }
        .role-tabs button.active { border-color: var(--primary); background: rgba(14,165,233,.08); color: var(--primary-dark); }
      `}</style>
    </form>
  );
}
