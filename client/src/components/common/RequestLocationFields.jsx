import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Input from './Input';
import Button from './Button';
import LocationPickerMap from './LocationPickerMap';
import { localizedName } from '../../utils/localize';
import { locationPoint } from '../../utils/requestLocation';

export default function RequestLocationFields({ control, prefix = 'request', disabled = false }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'ar';
  const [mapOpen, setMapOpen] = useState(false);
  const point = locationPoint(control.location);
  const selectedArea = [localizedName(control.city, lang), localizedName(control.district, lang)].filter(Boolean).join(' · ');
  const openMap = () => { control.cancelPending(); setMapOpen(true); };
  // The saved account area is filled in already; details open only on "Edit".
  const compact = control.complete && !control.editing && !control.error;
  const confirmMap = selected => { control.confirmMapPoint(selected); setMapOpen(false); };
  const field = (key, label, rows, unavailable = false) => (
    <div className="form-group" key={key}>
      <label className="form-label" htmlFor={`${prefix}-${key}`}>{label}</label>
      <select id={`${prefix}-${key}`} name={`${key}_id`} className="select" value={control.location[`${key}_id`]}
        onChange={event => control.change(`${key}_id`, event.target.value)} disabled={disabled || unavailable || rows.length === 0}>
        <option value="">{control.loading && rows.length === 0 ? t('common.loading') : t('common.select')}</option>
        {rows.map(row => <option key={row.id} value={row.id}>{localizedName(row, lang)}</option>)}
      </select>
    </div>
  );

  return (
    <section aria-labelledby={`${prefix}-location-title`} className={`border border-border rounded-card bg-surface-alt ${compact ? 'px-3 py-2 mb-4' : 'p-4 md:p-5 mb-5'}`}>
      <div className={`flex items-start justify-between gap-3 ${compact ? '' : 'mb-2'}`}>
        <div className="min-w-0">
          <h3 id={`${prefix}-location-title`} className="text-base font-bold text-fg">{t('request_location.title')}</h3>
          {selectedArea && <p className="text-sm text-fg font-semibold leading-relaxed mt-1">{selectedArea}</p>}
          {!compact && control.location.address && <p className="text-sm text-fg-muted leading-relaxed mt-1 break-words">{control.location.address}</p>}
          {!compact && control.hasPoint && <span className="inline-flex mt-2 text-xs font-semibold text-primary">📍 {t(control.source === 'saved' ? 'request_location.saved_point' : 'location.location_captured')}</span>}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={disabled || control.loading} onClick={() => control.setEditing(!control.editing)}>
          {t('request_location.edit')}
        </Button>
      </div>
      {!compact && <>
      <p className="text-xs text-fg-muted leading-relaxed mb-3">
        {t(control.loading ? 'request_location.location_loading' : control.source === 'saved' ? 'request_location.saved_hint' : control.source === 'query' ? 'request_location.query_hint' : 'request_location.missing_hint')}
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button type="button" size="sm" variant="outline" onClick={control.useAccount} disabled={disabled || !control.accountAvailable}>
          {t('request_location.use_account')}
        </Button>
        {!control.complete && <Link to="/profile" className="text-sm text-primary font-semibold self-center">{t('nav.profile')}</Link>}
      </div>
      </>}
      {control.error && <div role="alert" className="form-error mb-3 flex flex-wrap gap-2 items-center">
        <span>{t('location.options_unavailable')}</span>
        <Button type="button" size="sm" variant="outline" onClick={control.retry} disabled={disabled}>{t('provider.retry_catalog')}</Button>
      </div>}

      {control.editing && <div className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
          {control.countries.length !== 1 && field('country', t('location.country'), control.countries)}
          {field('region', t('location.region'), control.regions, !control.location.country_id)}
          {field('governorate', t('location.governorate'), control.governorates, !control.location.region_id)}
          {field('city', t('location.city'), control.cities, !control.location.region_id)}
          {field('district', t('location.district'), control.districts, !control.location.city_id || control.loading)}
        </div>
        {control.manualDistrict && <p className="text-xs text-fg-muted -mt-2 mb-3">{t('location.no_districts')}</p>}
        <Input id={`${prefix}-address`} name="address" label={t('location.address')} value={control.location.address} maxLength={500}
          onChange={event => control.change('address', event.target.value)} placeholder={t('request.address_ph')} hint={t('request_location.address_hint')} disabled={disabled} />
        <div className="flex flex-wrap gap-2 mb-3">
          <Button type="button" size="sm" variant="outline" onClick={control.useDeviceLocation} loading={control.locating} disabled={disabled || !control.ready}>
            📍 {t('request.use_my_location')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={openMap} disabled={disabled || !control.ready}>
            {t('auth.pick_on_map')}
          </Button>
          {control.hasPoint && <Button type="button" size="sm" variant="ghost" onClick={control.clearPoint} disabled={disabled}>{t('request_location.clear_point')}</Button>}
        </div>
        {control.locationMessage && <p role="status" className="text-xs text-fg-muted leading-relaxed mb-3">{t(control.locationMessage)}</p>}
        {!control.hasPoint && <p className="text-xs text-fg-muted leading-relaxed mb-3">{t('request_location.point_needed')}</p>}
      </div>}

      {!compact && <>
      <label className={`flex items-start gap-2 text-sm leading-relaxed ${control.complete ? 'text-fg cursor-pointer' : 'text-fg-muted'}`}>
        <input id={`${prefix}-remember-location`} name="remember_location" type="checkbox" checked={control.remember}
          onChange={event => control.setRemember(event.target.checked)} disabled={disabled || !control.complete} className="mt-1 accent-primary" />
        <span>{t('request_location.remember')}</span>
      </label>
      <p className="text-xs text-fg-muted leading-relaxed mt-1">{t(control.complete ? 'request_location.remember_hint' : 'request_location.complete_to_remember')}</p>
      </>}
      <LocationPickerMap open={mapOpen && !disabled} onClose={() => setMapOpen(false)} onConfirm={confirmMap}
        initialLat={point?.latitude} initialLon={point?.longitude} initialPointSelected={Boolean(point)} />
    </section>
  );
}
