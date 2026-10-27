import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, Circle } from 'react-leaflet';
import { icon } from 'leaflet';
import markerImage from 'leaflet/dist/images/marker-icon.png';
import markerImage2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';
import api from '../services/api';
import BaseTileLayer from '../components/map/BaseTileLayer';
import Avatar from '../components/common/Avatar';
import AvailabilityBadge, { workingSummary } from '../components/common/AvailabilityBadge';
import CallButtons from '../components/calls/CallButtons';
import { LoadingState, ErrorState } from '../components/common/Spinner';
import { directionsUrl } from '../utils/directions';
import { localizedName } from '../utils/localize';

const pinIcon = icon({ iconUrl: markerImage, iconRetinaUrl: markerImage2x, shadowUrl: markerShadow,
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });

export default function ProviderProfilePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    let current = true;
    setData(null);
    setError(null);
    api.get(`/users/${encodeURIComponent(id)}`)
      .then(({ data: body }) => {
        if (!current) return;
        if (body.data?.user?.role !== 'provider') setError('map.provider_not_found');
        else setData(body.data);
      })
      .catch(() => { if (current) setError('map.provider_not_found'); });
    return () => { current = false; };
  }, [id]);

  if (error) return <div className="container py-6"><ErrorState message={t(error)} /></div>;
  if (!data) return <LoadingState />;

  const { user, provider = {} } = data;
  const exact = provider.fixed_latitude != null && provider.fixed_longitude != null;
  const point = exact ? [Number(provider.fixed_latitude), Number(provider.fixed_longitude)] : null;
  const city = localizedName({ name_ar: user.city_name_ar, name_en: user.city_name_en, name: user.city_name }, lang);
  const radius = Number(provider.service_radius_km) || null;

  return (
    <div className="container py-4 space-y-3 max-w-3xl">
      <div className="card p-4 flex gap-3 items-center">
        <Avatar src={user.avatar} name={user.full_name} size="lg" />
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-fg truncate">{provider.business_name || user.full_name}</h1>
          <div className="text-[12.5px] text-fg-muted">
            ⭐ {Number(provider.rating_avg || 0).toFixed(1)} ({provider.rating_count || 0})
            {user.is_verified ? ` · ✓ ${t('map.verified')}` : ''}
            {city ? ` · ${city}` : ''}
          </div>
          {provider.availability && <div className="mt-1 space-y-0.5">
            <AvailabilityBadge availability={provider.availability} />
            <div className="text-[12px] text-fg-muted">🗓️ {workingSummary(provider.availability, t, i18n.resolvedLanguage || 'ar')}</div>
          </div>}
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h2 className="font-bold text-fg">{t('calls.contact_title')}</h2>
        <CallButtons userId={user.id} />
      </div>

      {provider.bio && <div className="card p-4 text-[13.5px] text-fg whitespace-pre-line">{provider.bio}</div>}

      <div className="card p-4 space-y-2">
        <h2 className="font-bold text-fg">{t('map.service_area')}</h2>
        <p className="text-[13px] text-fg-muted">
          {radius ? t('map.serves_within', { value: radius, city: city || t('map.their_city') }) : t('map.area_unknown')}
          {provider.location_mode === 'mobile' && ` · ${t('map.mobile_provider')}`}
        </p>
        {point ? (
          <>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => mapRef.current?.setView(point, 15)}
                className="px-3 py-1.5 rounded-pill text-[12.5px] bg-surface-alt border border-border">📍 {t('map.show_location')}</button>
              <a href={directionsUrl(point[0], point[1])} target="_blank" rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-pill text-[12.5px] bg-surface-alt border border-border">🧭 {t('map.directions')}</a>
            </div>
            {provider.fixed_address && <div className="text-[12.5px] text-fg-muted">{provider.fixed_address}</div>}
            <div className="rounded-card overflow-hidden border border-border" style={{ height: 260 }}>
              <MapContainer ref={mapRef} center={point} zoom={12} style={{ height: '100%', width: '100%' }}>
                <BaseTileLayer />
                <Marker position={point} icon={pinIcon} />
                {radius && <Circle center={point} radius={radius * 1000} pathOptions={{ color: '#0ea5e9', weight: 1, fillOpacity: 0.08 }} />}
              </MapContainer>
            </div>
          </>
        ) : (
          <div className="text-[12.5px] text-fg-subtle">{t('map.location_private')}</div>
        )}
      </div>
    </div>
  );
}
