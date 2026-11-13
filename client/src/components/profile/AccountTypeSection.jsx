import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { changeAccountType } from '../../services/authService';
import { apiError } from '../../services/api';
import { Link } from 'react-router-dom';
import Button from '../common/Button';
import ProfessionsPicker from '../common/ProfessionsPicker';
import CoverageDistrictsPicker from '../common/CoverageDistrictsPicker';
import ServiceVenuePicker from '../common/ServiceVenuePicker';
import LocationPickerMap from '../common/LocationPickerMap';
import usePublicSettings from '../../hooks/usePublicSettings';
import { hiddenFields } from '../../data/formFields';

const TYPES = [
  { key: 'client', icon: '🙋', label: 'auth.role_client' },
  { key: 'provider', icon: '🛠️', label: 'auth.role_provider' },
  { key: 'both', icon: '🔁', label: 'auth.role_both' },
];

// Fixes the account type chosen at sign-up. A client who starts providing
// services gives the same work details as a provider sign-up.
export default function AccountTypeSection({ onSaved, onError }) {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const current = user?.role === 'client' ? 'client' : Number(user?.also_client) === 1 ? 'both' : 'provider';
  const [target, setTarget] = useState(current);
  const [serviceIds, setServiceIds] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [coverageCount, setCoverageCount] = useState(null);
  const [mode, setMode] = useState('mobile');
  const [venue, setVenue] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // The result is also shown here, next to the button, not only at the top of the page (AYK-216).
  const [done, setDone] = useState('');
  // Jobs that stop the change to requester, listed with links (AYK-070). Above the early
  // return, like every hook (AYK-140).
  const [blockingJobs, setBlockingJobs] = useState([]);
  // Work details the owner hid in «حقول النماذج» are not asked (AYK-217).
  const { settings } = usePublicSettings();
  const hidden = hiddenFields(settings.form_fields_hidden, 'account_type');

  if (!user || !['client', 'provider'].includes(user.role)) return null;
  const needsWork = current === 'client' && target !== 'client';
  const missing = !needsWork ? null
    : !serviceIds.length ? t('provider.professions_required')
      : !hidden.has('coverage') && coverageCount > 0 && !coverage.length ? t('provider.coverage_required')
        : !hidden.has('location_mode') && mode !== 'mobile' && !venue ? t('provider.venue_point_required') : null;
  const canSave = target !== current && !missing && !saving;

  const save = async () => {
    onError(''); onSaved(''); setBlockingJobs([]); setDone('');
    setSaving(true);
    try {
      await changeAccountType({
        role: target,
        ...(needsWork ? {
          service_ids: serviceIds,
          coverage_district_ids: hidden.has('coverage') ? (user.district_id ? [Number(user.district_id)] : []) : coverage,
          location_mode: hidden.has('location_mode') ? 'mobile' : mode,
          ...(!hidden.has('location_mode') && mode !== 'mobile' && venue ? { fixed_latitude: venue.lat, fixed_longitude: venue.lon } : {}),
        } : {}),
      });
      await refresh();
      onSaved(t('auth.account_type_changed'));
      setDone(t('auth.account_type_changed'));
    } catch (err) {
      onError(apiError(err));
      setBlockingJobs(err?.response?.data?.errors?.jobs || []);
    } finally { setSaving(false); }
  };

  return (
    <div className="card mb-4" id="account-type" data-testid="account-type">
      {blockingJobs.length > 0 && (
        <div className="mb-3 p-3 rounded-card bg-danger-soft text-[13.5px]" role="alert" data-testid="blocking-jobs">
          <p className="m-0 mb-2 font-semibold">{t('profile.blocking_jobs_title')}</p>
          <ul className="m-0 ps-5 space-y-1">
            {blockingJobs.map(job => (
              <li key={job.id}><Link to={`/requests/${job.id}`} className="font-semibold text-primary underline">{job.title || `#${job.id}`}</Link></li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-fg-muted">{t('profile.blocking_jobs_hint')}</p>
        </div>
      )}
      {done && <div role="status" className="mb-3 px-3 py-2.5 rounded-card bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13.5px] font-semibold" data-testid="account-type-done">✓ {done}</div>}
      <h3 className="mb-1">{t('profile.account_type')}</h3>
      <p className="text-[12.5px] text-fg-muted mb-3">{t('profile.account_type_hint')}</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('profile.account_type')}>
        {TYPES.map(type => (
          <button key={type.key} type="button" role="radio" aria-checked={target === type.key} disabled={saving}
            onClick={() => setTarget(type.key)}
            className={`rounded-card border-2 px-2 py-2.5 text-[13px] font-semibold transition ${target === type.key ? 'border-primary bg-primary-soft text-primary' : 'border-border text-fg-muted hover:bg-surface-alt'}`}>
            <span className="block text-lg leading-none mb-1">{type.icon}</span>
            {t(type.label)}
            {type.key === current && <span className="block text-[10.5px] font-normal text-fg-subtle mt-0.5">{t('profile.account_type_current')}</span>}
          </button>
        ))}
      </div>

      {needsWork && (
        <div className="space-y-3 mt-3">
          <p className="text-[12.5px] text-fg-muted m-0">{t('profile.account_type_work_hint')}</p>
          <ProfessionsPicker serviceIds={serviceIds} onChange={setServiceIds} disabled={saving} />
          {!hidden.has('coverage') && <CoverageDistrictsPicker cityId={user.city_id} value={coverage} onChange={setCoverage} disabled={saving}
            onDistrictsLoaded={setCoverageCount} />}
          {!hidden.has('location_mode') && <ServiceVenuePicker value={mode} onChange={setMode} disabled={saving} />}
          {!hidden.has('location_mode') && mode !== 'mobile' && (
            <div>
              <Button type="button" variant={venue ? 'outline' : 'primary'} onClick={() => setMapOpen(true)}>
                📍 {venue ? t('provider.venue_point_change') : t('provider.venue_point_pick')}
              </Button>
              {venue && <div className="text-[12px] text-fg-muted mt-1">✓ {t('provider.venue_point_set')}</div>}
            </div>
          )}
        </div>
      )}

      {target === 'client' && current !== 'client' && (
        <div className="mt-3 px-3 py-2.5 rounded-card bg-warning-soft text-warning text-[12.5px]">{t('profile.account_type_to_client_note')}</div>
      )}

      {target !== current && (
        <div className="mt-3">
          <Button type="button" variant="primary" block loading={saving} disabled={!canSave} onClick={save}>
            {t('profile.account_type_save')}
          </Button>
          {missing && <p className="text-center text-[12px] text-fg-muted mt-1">{t('auth.complete_to_enable', { item: missing })}</p>}
        </div>
      )}

      <LocationPickerMap open={mapOpen} initialLat={venue?.lat ?? user.latitude} initialLon={venue?.lon ?? user.longitude}
        initialPointSelected={!!venue} onClose={() => setMapOpen(false)}
        onConfirm={result => setVenue({ lat: result.lat, lon: result.lon })} />
    </div>
  );
}
