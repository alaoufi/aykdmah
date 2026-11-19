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
import ShareProviderLink, { DirectoryButton } from '../components/providers/ShareProviderLink';
import StarRating from '../components/reviews/StarRating';
import ReviewCard from '../components/reviews/ReviewCard';
import TrustSummary from '../components/reviews/TrustSummary';
import { getUserReviews } from '../services/reviewService';
import ProviderNumbers from '../components/providers/ProviderNumbers';
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
  const [note, setNote] = useState('');
  const [reviews, setReviews] = useState(null);
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
    // The latest opinions, shown to everyone on the page (AYK-320).
    setReviews(null);
    getUserReviews(id, { type: 'on_provider', limit: 5 })
      .then(body => { if (current) setReviews(Array.isArray(body?.data) ? body.data : []); })
      .catch(() => { if (current) setReviews([]); });
    return () => { current = false; };
  }, [id]);

  if (error) return <div className="container py-6"><ErrorState message={t(error)} /></div>;
  if (!data) return <LoadingState />;

  const { user, provider = {} } = data;
  const exact = provider.fixed_latitude != null && provider.fixed_longitude != null;
  const point = exact ? [Number(provider.fixed_latitude), Number(provider.fixed_longitude)] : null;
  const city = localizedName({ name_ar: user.city_name_ar, name_en: user.city_name_en, name: user.city_name }, lang);
  const radius = Number(provider.service_radius_km) || null;

  const count = Number(provider.rating_count) || 0;
  const average = Number(provider.rating_avg) || 0;
  const done = Number(provider.completed_orders) || 0;
  const hasNumbers = Boolean(provider.public_phone || provider.public_whatsapp);
  const name = provider.business_name || user.full_name;

  return (
    <div className="container py-4 space-y-3 max-w-3xl pb-28 md:pb-6">
      {/* AYK-320 (the owner): the provider's details in one panel, the rating clear to everyone, and
          contact and sharing as drop-down menus. */}
      <section className="card tone-provider p-4 space-y-4" data-testid="provider-panel">
        <div className="flex gap-3 items-center">
          <Avatar src={user.avatar} name={user.full_name} size="lg" />
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-fg truncate">{name}</h1>
            <div className="text-[12.5px] text-fg-muted">
              {user.is_verified ? `✓ ${t('map.verified')}` : ''}
              {user.is_verified && city ? ' · ' : ''}
              {city || ''}
            </div>
            {provider.availability && <div className="mt-1 space-y-0.5">
              <AvailabilityBadge availability={provider.availability} />
              <div className="text-[12px] text-fg-muted">🗓️ {workingSummary(provider.availability, t, i18n.resolvedLanguage || 'ar')}</div>
            </div>}
          </div>
        </div>

        <div className="rounded-card bg-surface border border-border p-3 flex items-center gap-3 flex-wrap" data-testid="provider-rating">
          <span className="text-3xl font-extrabold text-fg leading-none">{count ? average.toFixed(1) : '—'}</span>
          <div className="min-w-0">
            <StarRating value={average} readOnly size={20} />
            <div className="text-[12.5px] text-fg-muted">
              {count ? t('provider_page.rating_count', { count }) : t('for_you.no_ratings')}
              {done ? ` · ${t('provider_page.completed', { count: done })}` : ''}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-start">
          <details className="group" data-testid="provider-contact-menu">
            <summary className="btn btn-primary btn-sm list-none cursor-pointer select-none">
              📞 {t('provider_page.contact')} <span className="transition-transform group-open:rotate-180 inline-block">▾</span>
            </summary>
            <div className="mt-2 p-3 rounded-card bg-surface border border-border space-y-2 min-w-[240px]">
              <CallButtons userId={user.id} />
              {hasNumbers && <ProviderNumbers phone={provider.public_phone} whatsapp={provider.public_whatsapp} />}
            </div>
          </details>
          <DirectoryButton providerId={user.id} name={name} onNote={setNote} />
          <details className="group" data-testid="provider-share-menu">
            <summary className="px-3 py-2 rounded-pill text-[13px] bg-surface-alt border border-border font-bold list-none cursor-pointer select-none">
              🔗 {t('share_provider.share')} <span className="transition-transform group-open:rotate-180 inline-block">▾</span>
            </summary>
            <div className="mt-2 p-3 rounded-card bg-surface border border-border min-w-[240px]">
              <ShareProviderLink providerId={user.id} name={name} bare />
            </div>
          </details>
        </div>
        {note && <p role="status" className="text-[12.5px] text-fg-muted m-0">{note}</p>}
      </section>

      <section className="card p-4 space-y-2" data-testid="provider-reviews">
        <h2 className="font-bold text-fg">⭐ {t('chat.provider_opinions')}</h2>
        {reviews === null ? <p className="text-[13px] text-fg-muted">{t('common.loading')}</p>
          : !reviews.length ? <p className="text-[13px] text-fg-muted">{t('for_you.no_ratings')}</p>
          : <div className="space-y-2">{reviews.map(review => <ReviewCard key={review.id} review={review} />)}</div>}
        {count > reviews?.length && <TrustSummary userId={user.id} average={average} count={count} />}
      </section>

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
