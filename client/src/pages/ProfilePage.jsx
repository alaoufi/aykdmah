import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { updateProfile, changePassword, updateProviderProfile, me } from '../services/authService';
import { listCountries, reverseGeocode } from '../services/serviceService';
import useLocationOptions from '../hooks/useLocationOptions';
import { useLocation } from 'react-router-dom';
import Input from '../components/common/Input';
import PasswordInput from '../components/common/PasswordInput';
import Button from '../components/common/Button';
import Avatar from '../components/common/Avatar';
import LocationPickerMap from '../components/common/LocationPickerMap';
import ServiceVenuePicker from '../components/common/ServiceVenuePicker';
import ProfessionsPicker from '../components/common/ProfessionsPicker';
import CoverageDistrictsPicker from '../components/common/CoverageDistrictsPicker';
import { apiError } from '../services/api';
import { localizedName } from '../utils/localize';
import AvailabilityEditor from '../components/provider/AvailabilityEditor';
import AccountTypeSection from '../components/profile/AccountTypeSection';
import CallAlerts from '../components/notifications/CallAlerts';
import DevicePermissions from '../components/common/DevicePermissions';
import WorkPanel from '../components/provider/WorkPanel';
import MyMarket from '../components/provider/MyMarket';
import { getCurrentPosition, isValidCoordinates, geoSelection, preserveCoordinatesForAreaChange } from '../utils/geolocation.mjs';

const LOCATION_LEVELS = ['country_id', 'region_id', 'governorate_id', 'city_id', 'district_id'];
const formFromUser = (user) => ({
  full_name: user?.full_name || '', phone: user?.phone || '', address: user?.address || '',
  ...Object.fromEntries(LOCATION_LEVELS.map(key => [key, user?.[key] ?? ''])),
  latitude: user?.latitude == null ? null : Number(user.latitude),
  longitude: user?.longitude == null ? null : Number(user.longitude),
});

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const { user, refresh } = useAuth();
  const [form, setForm] = useState(() => formFromUser(user));
  // Links such as "Edit your area" (/profile#my-area) open on that section,
  // also when the profile page is already open.
  const { hash } = useLocation();
  useEffect(() => {
    const id = hash.slice(1);
    if (!id) return undefined;
    const timer = setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    return () => clearTimeout(timer);
  }, [hash]);
  const [entryUser, setEntryUser] = useState(user);
  const [completeOnEntry, setCompleteOnEntry] = useState(false);
  const [locationEdited, setLocationEdited] = useState(false);
  const [pointConfirmed, setPointConfirmed] = useState(() => isValidCoordinates(Number(user?.latitude), Number(user?.longitude)) && user?.latitude != null && user?.longitude != null);
  const dirty = useRef(false);
  const dirtyScalarKeys = useRef(new Set());
  const entryCompleteResolved = useRef(false);
  const formRevision = useRef(0);
  const userId = useRef(user?.id);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState(false);
  // Only one active country: preselect it so the choice starts at the region.
  useEffect(() => {
    if (countries.length === 1 && !form.country_id) setForm(previous => ({ ...previous, country_id: String(countries[0].id) }));
  }, [countries, form.country_id]);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMsg, setLocationMsg] = useState('');
  const [mapOpen, setMapOpen] = useState(false);
  const locationRequest = useRef(0);
  const locationController = useRef(null);
  const { rows: regions, loading: regionsLoading, error: regionsError } = useLocationOptions('regions', form.country_id);
  const { rows: governorates, loading: governoratesLoading, error: governoratesError } = useLocationOptions('governorates', form.region_id);
  const { rows: cities, loading: citiesLoading, error: citiesError } = useLocationOptions(
    'regionCities', form.region_id,
  );
  const { rows: districts, loading: districtsLoading, error: districtsError } = useLocationOptions('districts', form.city_id);
  const { rows: entryDistricts, loading: entryDistrictsLoading, error: entryDistrictsError } = useLocationOptions('districts', entryUser?.city_id);
  const hasPoint = isValidCoordinates(form.latitude, form.longitude);
  const requiresComplete = completeOnEntry || locationEdited;
  const selectedCity = cities.find(city => Number(city.id) === Number(form.city_id));
  const mapCenter = hasPoint ? { lat: form.latitude, lon: form.longitude }
    : selectedCity?.latitude != null && selectedCity?.longitude != null &&
      isValidCoordinates(Number(selectedCity.latitude), Number(selectedCity.longitude))
      ? { lat: Number(selectedCity.latitude), lon: Number(selectedCity.longitude) } : null;

  // Session refreshes may supply the same user asynchronously. Only a new
  // account or a clean form may replace what the user is currently editing.
  useEffect(() => {
    if (userId.current !== user?.id) {
      userId.current = user?.id;
      dirty.current = false;
      dirtyScalarKeys.current.clear();
      formRevision.current += 1;
      setEntryUser(user);
      entryCompleteResolved.current = false;
      setCompleteOnEntry(false);
      setLocationEdited(false);
      locationRequest.current += 1;
      locationController.current?.abort();
      setLocating(false);
    }
    if (!dirty.current) {
      const next = formFromUser(user);
      setForm(next);
      setPointConfirmed(isValidCoordinates(next.latitude, next.longitude));
    }
  }, [user]);
  useEffect(() => {
    if (!entryUser || entryUser.id !== user?.id || entryCompleteResolved.current || entryDistrictsLoading || entryDistrictsError) return;
    entryCompleteResolved.current = true;
    const initial = formFromUser(entryUser);
    setCompleteOnEntry(Boolean(initial.full_name.trim().length >= 2 &&
      /^\+?\d{8,15}$/.test(initial.phone.trim().replace(/[\s()-]/g, '')) &&
      initial.address.trim().length >= 5 && initial.city_id &&
      isValidCoordinates(initial.latitude, initial.longitude) &&
      (!entryDistricts.length || entryDistricts.some(row => Number(row.id) === Number(initial.district_id)))));
  }, [entryUser, user?.id, entryDistricts, entryDistrictsLoading, entryDistrictsError]);
  useEffect(() => {
    let current = true;
    listCountries().then(rows => { if (current) { setCountries(rows); if (!rows.length) setCountriesError(true); } })
      .catch(() => { if (current) setCountriesError(true); })
      .finally(() => { if (current) setCountriesLoading(false); });
    return () => { current = false; };
  }, []);
  useEffect(() => () => { locationRequest.current += 1; locationController.current?.abort(); }, []);

  const cancelLocation = () => {
    locationRequest.current += 1;
    locationController.current?.abort();
    setLocating(false);
  };
  const markEdited = () => { dirty.current = true; formRevision.current += 1; };
  const updateField = (key, value) => {
    markEdited();
    if (key === 'full_name' || key === 'phone') dirtyScalarKeys.current.add(key);
    if (key === 'address') {
      cancelLocation();
      setLocationEdited(true);
      setPointConfirmed(false);
    }
    setForm(previous => ({ ...previous, [key]: value }));
  };
  const changeArea = (key, value) => {
    cancelLocation();
    markEdited();
    setLocationEdited(true);
    setPointConfirmed(false);
    setLocationMsg('');
    const changes = { [key]: value,
      ...Object.fromEntries(LOCATION_LEVELS.slice(LOCATION_LEVELS.indexOf(key) + 1).map(level => [level, ''])),
    };
    if (key === 'city_id') {
      const city = cities.find(row => Number(row.id) === Number(value));
      changes.governorate_id = city?.governorate_id || '';
    }
    setForm(previous => ({
      ...previous, ...changes,
      ...(preserveCoordinatesForAreaChange(previous, changes) ? {} : { latitude: null, longitude: null }),
    }));
  };
  const applyPoint = (latitude, longitude, result) => {
    if (!isValidCoordinates(latitude, longitude)) return;
    markEdited();
    setLocationEdited(true);
    const selection = geoSelection(result);
    setForm(previous => ({
      ...previous, latitude, longitude,
      ...(previous.latitude === latitude && previous.longitude === longitude && !selection.city ? {} : {
        country_id: selection.country?.id || previous.country_id,
        region_id: selection.region?.id || '', governorate_id: selection.governorate?.id || '',
        city_id: selection.city?.id || '', district_id: selection.district?.id || '',
      }),
    }));
    setLocationMsg(selection.city ? t('location.location_captured') : t('auth.location_area_unknown'));
  };
  const useMyLocation = async () => {
    cancelLocation();
    const request = ++locationRequest.current;
    const controller = new AbortController();
    locationController.current = controller;
    setLocating(true); setLocationMsg('');
    setPointConfirmed(false);
    try {
      const position = await getCurrentPosition({ signal: controller.signal });
      const { latitude, longitude } = position.coords;
      if (request !== locationRequest.current || controller.signal.aborted) return;
      applyPoint(latitude, longitude, null);
      try {
        const result = await reverseGeocode({ lat: latitude, lon: longitude, signal: controller.signal });
        if (request === locationRequest.current && !controller.signal.aborted) applyPoint(latitude, longitude, result);
      } catch (_) { /* Keep the selected real coordinates even if address lookup fails. */ }
    } catch (error) {
      if (request === locationRequest.current && !controller.signal.aborted) {
        setLocationMsg(t(error.code === 1 ? 'auth.location_denied' : 'auth.location_failed'));
      }
    } finally { if (request === locationRequest.current) setLocating(false); }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    cancelLocation();
    setErr(''); setMsg('');
    let validationError = '';
    if ((locationEdited || dirtyScalarKeys.current.has('full_name')) && form.full_name.trim().length < 2) validationError = t('auth.account_name_required');
    else if ((locationEdited || dirtyScalarKeys.current.has('phone')) && !/^\+?\d{8,15}$/.test(form.phone.trim().replace(/[\s()-]/g, ''))) validationError = t('auth.account_phone_required');
    if (!validationError && locationEdited) {
      if (form.address.trim().length < 5) validationError = t('auth.account_address_required');
      else if (countriesLoading || regionsLoading || citiesLoading || districtsLoading) validationError = t('common.loading');
      else if (countriesError || regionsError || citiesError || districtsError) validationError = t('location.options_unavailable');
      else if (!countries.some(row => Number(row.id) === Number(form.country_id)) ||
          !regions.some(row => Number(row.id) === Number(form.region_id)) ||
          !cities.some(row => Number(row.id) === Number(form.city_id)) ||
          (districts.length > 0 && !districts.some(row => Number(row.id) === Number(form.district_id)))) validationError = t('auth.account_area_required');
      else if (!hasPoint) validationError = t('auth.location_point_required');
      else if (!pointConfirmed) validationError = t('auth.location_confirmation_required');
    }
    if (validationError) { setErr(validationError); return; }
    const revision = formRevision.current;
    setSaving(true);
    try {
      const saved = await updateProfile({
        ...Object.fromEntries([...dirtyScalarKeys.current].map(key => [key, form[key].trim()])),
        ...(locationEdited ? {
          ...Object.fromEntries(LOCATION_LEVELS.map(key => [key, form[key] || null])),
          address: form.address.trim() || null, latitude: form.latitude, longitude: form.longitude,
        } : {}),
        ...(requiresComplete ? { complete_profile: true, location_confirmed: pointConfirmed } : {}),
      });
      if (revision === formRevision.current) {
        setForm(formFromUser(saved));
        dirty.current = false;
        dirtyScalarKeys.current.clear();
        setLocationEdited(false);
        if (requiresComplete) setCompleteOnEntry(true);
        setPointConfirmed(isValidCoordinates(Number(saved?.latitude), Number(saved?.longitude)) && saved?.latitude != null && saved?.longitude != null);
      }
      await refresh();
      setMsg(t('profile.update_profile'));
    } catch (e2) { setErr(apiError(e2)); }
    finally { setSaving(false); }
  };
  const savePassword = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      await changePassword(pw);
      setPw({ current_password: '', new_password: '' });
      setMsg(t('profile.change_password'));
    } catch (e2) { setErr(apiError(e2)); }
  };
  const selectLevel = (key, rows, loading, disabled, error = false) => (
    <div className="form-group" key={key}>
      <label className="form-label" htmlFor={`profile-${key}`}>{t(`location.${key.replace('_id', '')}`)}</label>
      <select id={`profile-${key}`} name={key} className="select" value={form[key]} disabled={saving || loading || disabled || rows.length === 0}
        required={locationEdited && key !== 'governorate_id' && (key !== 'district_id' || rows.length > 0)}
        onChange={e => changeArea(key, e.target.value)}>
        <option value="">{loading ? t('common.loading') : error ? t('location.options_unavailable') : key === 'district_id' && form.city_id && rows.length === 0 ? t('location.no_districts') : t('common.select')}</option>
        {rows.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
      </select>
    </div>
  );

  return (
    <div className="container page" style={{ maxWidth: 720 }}>
      <h2 className="mb-4">{t('profile.title')}</h2>
      {msg && <div className="badge badge-success mb-3" role="status">{msg}</div>}
      {err && <div role="alert" className="form-error mb-3" style={{ padding: 10, background: 'rgba(239,68,68,.1)', borderRadius: 8 }}>{err}</div>}
      {/* The same one-tap permissions as at sign-up, first on the page (AYK-047). */}
      <div className="mb-4"><DevicePermissions /></div>
      {/* The provider's work settings and market numbers (AYK-054; they used to fill the home page). */}
      {user?.role === 'provider' && <div id="work"><WorkPanel /></div>}
      {user?.role === 'provider' && <div className="mb-4"><MyMarket /></div>}
      <div className="card mb-4" id="my-area">
        <div className="flex items-center gap-3 mb-3">
          <Avatar src={user?.avatar} name={user?.full_name} size="lg" />
          <div><h3 style={{ margin: 0 }}>{user?.full_name}</h3><div className="text-sm text-muted">{user?.email}</div></div>
        </div>
        <form onSubmit={saveProfile} data-testid="profile-form">
          <fieldset disabled={saving} className="min-w-0 border-0 p-0 m-0">
          {(countriesError || regionsError || governoratesError || citiesError || districtsError) && <div role="alert" className="form-error mb-3">{t('location.options_unavailable')}</div>}
          <Input id="profile-full_name" name="full_name" label={t('auth.full_name')} required minLength={2} maxLength={150}
            autoComplete="name" value={form.full_name} onChange={e => updateField('full_name', e.target.value)} />
          <Input id="profile-phone" name="phone" label={t('auth.phone')} type="tel" required={locationEdited || dirtyScalarKeys.current.has('phone')} maxLength={30}
            autoComplete="tel" dir="ltr" value={form.phone} onChange={e => updateField('phone', e.target.value)} />
          <h3 className="mb-3">{t('auth.your_location')}</h3>
          <div className="grid grid-2">
            {countries.length !== 1 && selectLevel('country_id', countries, countriesLoading, false, countriesError)}
            {selectLevel('region_id', regions, regionsLoading, !form.country_id, regionsError)}
            {selectLevel('city_id', cities, citiesLoading, !form.region_id, citiesError)}
            {selectLevel('district_id', districts, districtsLoading, !form.city_id, districtsError)}
          </div>
          <Input id="profile-address" name="address" label={t('location.address')} as="textarea" rows={3}
            required={locationEdited} minLength={locationEdited ? 5 : undefined} maxLength={500} autoComplete="street-address" value={form.address}
            onChange={e => updateField('address', e.target.value)} hint={t('auth.account_address_hint')} />
          <div className="flex gap-2 flex-wrap mb-3">
            <Button type="button" variant="ghost" data-testid="profile-use-location" onClick={useMyLocation} loading={locating}>{t('auth.use_my_location')}</Button>
            <Button type="button" variant="ghost" data-testid="profile-pick-location" onClick={() => { cancelLocation(); setMapOpen(true); }}>{t('location.pick_on_map')}</Button>
            {hasPoint && <Button type="button" variant="ghost" onClick={() => { cancelLocation(); markEdited(); setLocationEdited(true); setPointConfirmed(false); setForm(previous => ({ ...previous, latitude: null, longitude: null })); setLocationMsg(''); }}>{t('profile.clear_coordinates')}</Button>}
          </div>
          {hasPoint && <div className="text-sm text-muted mb-3" data-testid="profile-coordinates" dir="ltr">{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</div>}
          {locationMsg && <div role="status" className="text-sm text-muted mb-3">{locationMsg}</div>}
          {requiresComplete && <label className="flex items-start gap-2 text-sm mb-3">
            <input id="profile-location-confirmation" name="location_confirmed" type="checkbox" checked={pointConfirmed}
              disabled={!hasPoint || locating} onChange={e => setPointConfirmed(e.target.checked)} className="mt-1 w-4 h-4 accent-primary shrink-0" />
            <span>{t('auth.location_confirmation')}</span>
          </label>}
          <p className="text-xs text-muted mb-3">{t('profile.saved_location_hint')}</p>
          {user?.role === 'provider' && <p className="text-xs text-muted mb-3">{t('profile.private_account_address')}</p>}
          <Button type="submit" data-testid="profile-submit" variant="primary" loading={saving} disabled={locating}>{t('common.save')}</Button>
          </fieldset>
        </form>
      </div>
      <LocationPickerMap open={mapOpen} onClose={() => setMapOpen(false)}
        initialLat={mapCenter?.lat} initialLon={mapCenter?.lon}
        initialPointSelected={hasPoint}
        onConfirm={result => { cancelLocation(); applyPoint(result.lat, result.lon, result); setPointConfirmed(true); }} />
      <CallAlerts />
      <AccountTypeSection onSaved={setMsg} onError={setErr} />
      {user?.role === 'provider' && <AvailabilityEditor onSaved={setMsg} onError={setErr} />}
      {user?.role === 'provider' && <ProviderSection onSaved={setMsg} onError={setErr} t={t} refresh={refresh} />}
      <div className="card" id="change-password">
        <h3>{t('profile.change_password')}</h3>
        {Number(user?.must_change_password) === 1 && (
          <div role="alert" className="mb-3 px-3 py-2.5 rounded-card bg-amber-50 text-amber-800 border border-amber-200 text-[13px]">
            {t('profile.must_change_password')}
          </div>
        )}
        <form onSubmit={savePassword}>
          <PasswordInput label={t('profile.current_password')} required autoComplete="current-password"
            value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} />
          <PasswordInput label={t('profile.new_password')} required minLength={4} autoComplete="new-password"
            value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} />
          <Button type="submit" variant="primary">{t('common.save')}</Button>
        </form>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// Provider-only section: business info + service venue (fixed | mobile | both).
// Visible only when the logged-in user has role='provider'.
// ----------------------------------------------------------------------
function ProviderSection({ onSaved, onError, t, refresh }) {
  const { user } = useAuth();
  const [provider, setProvider] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickPos, setPickPos] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const gpsController = useRef(null);

  useEffect(() => {
    let current = true;
    me().then((u) => {
      if (!current) return;
      const p = u.provider || {};
      setProvider({
        category_id: p.category_id ?? '',
        service_ids: Array.isArray(p.service_ids) ? p.service_ids : [],
        coverage: Array.isArray(p.coverage_districts) ? p.coverage_districts.map(row => Number(row.id)) : [],
        coverage_city_id: p.coverage_city_id || '',
        also_client: Number(u.user?.also_client) === 1,
        business_name: p.business_name || '',
        bio: p.bio || '',
        experience_years: p.experience_years ?? 0,
        service_radius_km: p.service_radius_km ?? 25,
        // Preserve the existing fixed-venue fallback for legacy profiles that
        // predate an explicit choice. New registrations already save mobile.
        location_mode: p.location_mode || 'fixed',
        fixed_latitude: p.fixed_latitude == null ? null : Number(p.fixed_latitude),
        fixed_longitude: p.fixed_longitude == null ? null : Number(p.fixed_longitude),
        fixed_address: p.fixed_address || '',
        show_location_on_map: Number(p.show_location_on_map) === 1,
      });
      if (p.fixed_latitude != null && p.fixed_longitude != null) {
        setPickPos({ latitude: Number(p.fixed_latitude), longitude: Number(p.fixed_longitude) });
      }
    }).catch(error => { if (current) onError(apiError(error)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; gpsController.current?.abort(); };
  }, []);

  const useMyLocation = async () => {
    gpsController.current?.abort();
    const controller = new AbortController();
    gpsController.current = controller;
    setLocating(true);
    try {
      const position = await getCurrentPosition({ signal: controller.signal });
      const { latitude, longitude } = position.coords;
      if (!controller.signal.aborted) {
        setPickPos({ latitude, longitude });
        setProvider((p) => ({ ...p, fixed_latitude: latitude, fixed_longitude: longitude }));
      }
    } catch (_) {
      if (!controller.signal.aborted) onError(t('location.geolocation_failed'));
    } finally { if (!controller.signal.aborted) setLocating(false); }
  };

  const save = async (e) => {
    e.preventDefault();
    gpsController.current?.abort();
    setLocating(false);
    onError(''); onSaved('');
    setSaving(true);
    try {
      // Services may span several professions; coverage is one city's districts.
      const { coverage, coverage_city_id, category_id: _category, ...fields } = provider;
      const payload = { ...fields, show_location_on_map: provider.show_location_on_map ? 1 : 0,
        any_category: true, also_client: provider.also_client ? 1 : 0, coverage_district_ids: coverage,
        ...(coverage_city_id ? { coverage_city_id: Number(coverage_city_id) } : {}) };
      if (pickPos && payload.location_mode !== 'mobile') {
        payload.fixed_latitude = pickPos.latitude;
        payload.fixed_longitude = pickPos.longitude;
      }
      if (payload.location_mode === 'mobile') {
        payload.fixed_latitude = null;
        payload.fixed_longitude = null;
        payload.fixed_address = '';
      }
      await updateProviderProfile(payload);
      if (payload.location_mode === 'mobile') {
        setProvider(previous => ({ ...previous, fixed_latitude: null, fixed_longitude: null, fixed_address: '' }));
        setPickPos(null);
      }
      await refresh();
      onSaved(t('profile.update_provider'));
    } catch (err) {
      onError(apiError(err));
    } finally { setSaving(false); }
  };

  if (loading) return null;
  if (!provider) return null;

  return (
    <div className="card mb-4" id="provider">
      <h3 className="mb-3">{t('provider.section_title')}</h3>
      <form onSubmit={save} className="space-y-3">
        <ProfessionsPicker serviceIds={provider.service_ids} disabled={saving}
          onChange={ids => setProvider(previous => ({ ...previous, service_ids: ids }))} />
        <CoverageDistrictsPicker cityId={provider.coverage_city_id || user?.city_id} value={provider.coverage} disabled={saving}
          onChange={ids => setProvider(previous => ({ ...previous, coverage: ids }))} />
        <label className="flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-1 w-4 h-4 accent-primary shrink-0" checked={provider.also_client}
            onChange={e => setProvider(previous => ({ ...previous, also_client: e.target.checked }))} />
          <span><b>{t('auth.role_both')}</b> — {t('auth.role_both_hint')}</span>
        </label>
        <Input label={t('profile.business_name')} value={provider.business_name}
          onChange={(e) => setProvider({ ...provider, business_name: e.target.value })} />

        <Input as="textarea" label={t('profile.bio')} value={provider.bio}
          onChange={(e) => setProvider({ ...provider, bio: e.target.value })} />
        <Input label={t('profile.experience_years')} type="number" min="0" max="100" value={provider.experience_years}
          onChange={event => setProvider(previous => ({ ...previous, experience_years: event.target.value }))} />

        <ServiceVenuePicker value={provider.location_mode} disabled={saving} onChange={mode => {
          gpsController.current?.abort();
          setLocating(false);
          setMapOpen(false);
          setProvider(previous => ({ ...previous, location_mode: mode }));
        }} />

        {provider.location_mode !== 'mobile' && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="form-label" style={{ marginBottom: 0 }}>{t('provider.fixed_location')}</label>
              <Button type="button" variant="ghost" onClick={useMyLocation} loading={locating}>
                📍 {t('location.use_my_location')}
              </Button>
            </div>
            <Button variant="ghost" onClick={() => { gpsController.current?.abort(); setLocating(false); setMapOpen(true); }}>{t('location.pick_on_map')}</Button>
            {pickPos && (
              <div className="text-[11.5px] text-fg-subtle font-mono">
                {pickPos.latitude.toFixed(5)}, {pickPos.longitude.toFixed(5)}
              </div>
            )}
            <Input label={t('provider.fixed_address')} value={provider.fixed_address}
              onChange={(e) => setProvider({ ...provider, fixed_address: e.target.value })}
              maxLength={255} placeholder={t('location.address')} hint={t('provider.venue_publish_hint')} />
            <label htmlFor="provider-show-on-map" className="flex items-start gap-2 text-[13px] text-fg cursor-pointer">
              <input id="provider-show-on-map" name="show_location_on_map" type="checkbox" className="mt-1"
                checked={!!provider.show_location_on_map}
                onChange={event => setProvider(previous => ({ ...previous, show_location_on_map: event.target.checked }))} />
              <span>
                {t('map.show_on_map')}
                <span className="block text-[11.5px] text-fg-subtle">{t('map.show_on_map_hint')}</span>
              </span>
            </label>
          </>
        )}

        {provider.location_mode === 'mobile' && (
          <div className="px-3 py-2.5 rounded-card bg-info-soft text-info text-[12.5px]">
            🚗 {t('provider.mobile_explainer')}
          </div>
        )}

        {provider.location_mode === 'both' && <div className="px-3 py-2.5 rounded-card bg-info-soft text-info text-[12.5px]">
          {t('provider.both_explainer')}
        </div>}

        {provider.location_mode !== 'fixed' && <Input label={t('profile.service_radius')} type="number" min="1" max="200"
          value={provider.service_radius_km}
          onChange={(e) => setProvider({ ...provider, service_radius_km: Number(e.target.value) || 1 })} />}

        <Button type="submit" variant="primary" loading={saving} disabled={locating}>{t('common.save')}</Button>
      </form>
      <LocationPickerMap open={mapOpen && provider.location_mode !== 'mobile'} onClose={() => setMapOpen(false)}
        initialLat={pickPos?.latitude} initialLon={pickPos?.longitude}
        initialPointSelected={isValidCoordinates(pickPos?.latitude, pickPos?.longitude)}
        onConfirm={result => {
          gpsController.current?.abort();
          setLocating(false);
          setPickPos({ latitude: result.lat, longitude: result.lon });
          setProvider(previous => ({ ...previous, fixed_latitude: result.lat, fixed_longitude: result.lon }));
        }} />
    </div>
  );
}
