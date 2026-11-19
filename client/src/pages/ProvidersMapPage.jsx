import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Popup, CircleMarker, useMap } from 'react-leaflet';
import { icon } from 'leaflet';
import markerImage from 'leaflet/dist/images/marker-icon.png';
import markerImage2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import BaseTileLayer from '../components/map/BaseTileLayer';
import LocationPickerMap from '../components/common/LocationPickerMap';
import Avatar from '../components/common/Avatar';
import { useAuth } from '../hooks/useAuth';
import { listCategories, listNearbyProviders } from '../services/serviceService';
import AvailabilityBadge from '../components/common/AvailabilityBadge';
import { getCurrentPosition, isValidCoordinates } from '../utils/geolocation.mjs';
import { directionsUrl, formatDistanceKm } from '../utils/directions';
import { localizedName } from '../utils/localize';

const pinIcon = icon({ iconUrl: markerImage, iconRetinaUrl: markerImage2x, shadowUrl: markerShadow,
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });
const RADII = [5, 10, 25, 50, 100];

function FitToResults({ origin, providers }) {
  const map = useMap();
  useEffect(() => {
    if (!origin) return;
    const points = [[origin.lat, origin.lon], ...providers.map(p => [p.latitude, p.longitude])];
    if (points.length === 1) map.setView(points[0], 12);
    else map.fitBounds(points, { padding: [32, 32], maxZoom: 14 });
  }, [map, origin, providers]);
  return null;
}

export default function ProvidersMapPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const lang = i18n.resolvedLanguage;
  const saved = user && isValidCoordinates(Number(user.latitude), Number(user.longitude))
    ? { lat: Number(user.latitude), lon: Number(user.longitude) } : null;
  const [origin, setOrigin] = useState(saved);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [radiusKm, setRadiusKm] = useState(25);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [locating, setLocating] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const requestRef = useRef(null);

  useEffect(() => { listCategories().then(setCategories).catch(() => {}); }, []);

  useEffect(() => {
    if (!origin) return undefined;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    listNearbyProviders({ lat: origin.lat, lon: origin.lon, radiusKm, categoryId, availableOnly, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setProviders(data.providers); })
      .catch(() => { if (!controller.signal.aborted) setError('map.providers_failed'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [origin, radiusKm, categoryId, availableOnly]);

  const locate = async () => {
    setLocating(true);
    setError(null);
    try {
      const position = await getCurrentPosition({});
      setOrigin({ lat: position.coords.latitude, lon: position.coords.longitude });
    } catch (err) {
      setError(err?.code === 1 ? 'auth.location_denied' : err?.code === 3 ? 'auth.location_timeout' : 'auth.location_failed');
    } finally { setLocating(false); }
  };

  const center = useMemo(() => origin ? [origin.lat, origin.lon] : [26.326, 43.975], [origin]);

  return (
    <div className="container py-4 space-y-3">
      <div>
        <h1 className="text-xl font-extrabold text-fg">{t('map.providers_title')}</h1>
        <p className="text-[13px] text-fg-muted">{t('map.providers_subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button type="button" onClick={locate} disabled={locating}
          className="px-3 py-2 rounded-pill text-sm bg-surface border border-border disabled:opacity-60">
          📍 {locating ? t('auth.locating') : t('auth.use_my_location')}
        </button>
        <button type="button" onClick={() => setPickerOpen(true)}
          className="px-3 py-2 rounded-pill text-sm bg-surface border border-border">
          🗺️ {t('location.pick_on_map')}
        </button>
        <select aria-label={t('map.filter_category')} value={categoryId} onChange={e => setCategoryId(e.target.value)}
          className="input w-auto text-sm">
          <option value="">{t('map.all_categories')}</option>
          {categories.map(c => <option key={c.id} value={c.id}>{localizedName(c, lang)}</option>)}
        </select>
        <select aria-label={t('map.filter_radius')} value={radiusKm} onChange={e => setRadiusKm(Number(e.target.value))}
          className="input w-auto text-sm">
          {RADII.map(r => <option key={r} value={r}>{t('map.within_km', { value: r })}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-pill text-sm bg-surface border border-border cursor-pointer">
          <input type="checkbox" className="w-4 h-4 accent-primary" checked={availableOnly} onChange={e => setAvailableOnly(e.target.checked)} />
          {t('availability.available_only')}
        </label>
      </div>

      {error && <div className="text-[12.5px] text-amber-700">{t(error)}</div>}
      {!origin && <div className="px-3 py-2.5 rounded-card bg-info-soft text-info text-[12.5px]">{t('map.choose_origin')}</div>}

      <div className="rounded-card overflow-hidden border border-border relative" style={{ height: '55dvh', minHeight: 280 }}>
        <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
          <BaseTileLayer />
          {origin && <CircleMarker center={[origin.lat, origin.lon]} radius={8}
            pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.9 }}>
            <Popup>{t('map.your_point')}</Popup>
          </CircleMarker>}
          {providers.map(p => (
            <Marker key={p.id} position={[p.latitude, p.longitude]} icon={pinIcon}>
              <Popup>
                <div className="text-[12.5px] space-y-1" dir={lang === 'ar' || lang === 'ur' ? 'rtl' : 'ltr'}>
                  <b>{p.business_name || p.full_name}</b>
                  <div><AvailabilityBadge availability={p.availability} /></div>
                  <div>⭐ {p.rating_avg.toFixed(1)} · {formatDistanceKm(p.distance_km, t)}</div>
                  {p.location_precision === 'city' && <div className="text-fg-subtle">{t('map.city_precision')}</div>}
                  <Link to={`/providers/${p.id}`}>{t('map.view_profile')}</Link>
                </div>
              </Popup>
            </Marker>
          ))}
          <FitToResults origin={origin} providers={providers} />
        </MapContainer>
        {loading && <div className="absolute bottom-2 inset-x-2 z-[1000] text-center text-[12px] bg-surface/90 rounded-card py-1">{t('map.loading_providers')}</div>}
      </div>

      {origin && !loading && providers.length === 0 && !error && (
        <div className="text-[13px] text-fg-muted">{t('map.no_providers')}</div>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {providers.map(p => (
          <li key={p.id} className="card p-3 flex gap-3 items-center">
            <Avatar src={p.avatar} name={p.full_name} />
            <div className="min-w-0 flex-1">
              <Link to={`/providers/${p.id}`} className="font-bold text-fg truncate block">{p.business_name || p.full_name}</Link>
              <div className="text-[12px] text-fg-muted">
                ⭐ {p.rating_avg.toFixed(1)} ({p.rating_count}) · {formatDistanceKm(p.distance_km, t)}
                {p.location_precision === 'city' && ` · ${t('map.city_precision')}`}
              </div>
              <AvailabilityBadge availability={p.availability} className="mt-1" />
            </div>
            {p.location_precision === 'exact' && (
              <a href={directionsUrl(p.latitude, p.longitude)} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-pill text-[12px] bg-surface-alt border border-border shrink-0">{t('map.directions')}</a>
            )}
          </li>
        ))}
      </ul>

      <LocationPickerMap open={pickerOpen} onClose={() => setPickerOpen(false)}
        initialLat={origin?.lat} initialLon={origin?.lon}
        onConfirm={point => setOrigin({ lat: point.lat, lon: point.lon })} />
    </div>
  );
}
