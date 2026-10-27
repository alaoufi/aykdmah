import i18n from '../i18n';
import { activeLocale } from './formatters';
// Geographic helpers used by the tracking + chat features.
import { isValidCoordinates, getCurrentPosition as browserPosition } from './geolocation.mjs';

// Haversine distance between two lat/lng points (km).
export function distanceKm(a, b) {
  if (!a || !b || !isValidCoordinates(a.latitude, a.longitude) || !isValidCoordinates(b.latitude, b.longitude)) return null;
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

// Naive ETA in minutes given a distance (km) and an average speed (km/h).
// Defaults to typical urban driving speed when network/route data isn't
// available client-side.
export function naiveEtaMinutes(distKm, speedKmh = 35) {
  if (distKm == null || distKm <= 0) return 0;
  return Math.ceil((distKm / speedKmh) * 60);
}

export function formatDistance(distKm) {
  if (distKm == null || !Number.isFinite(Number(distKm)) || Number(distKm) < 0) return '—';
  const distance = Number(distKm);
  if (distance < 1) return `${Math.round(distance * 1000).toLocaleString(activeLocale())} ${i18n.t('common.meter_short')}`;
  return `${distance.toLocaleString(activeLocale(), { minimumFractionDigits: distance < 10 ? 1 : 0, maximumFractionDigits: distance < 10 ? 1 : 0 })} ${i18n.t('common.kilometer_short')}`;
}

export function openInExternalMaps({ latitude, longitude, label }) {
  if (typeof window === 'undefined' || !isValidCoordinates(latitude, longitude)) return;
  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving`;
  window.open(url, '_blank', 'noopener');
}

export async function getCurrentPosition({ timeoutMs = 15000, signal } = {}) {
  const pos = await browserPosition({ timeoutMs, signal });
  return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
        heading: pos.coords.heading || null,
        speed_kmh: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : null,
  };
}

// Returns an unsubscribe function. Calls `onUpdate(position)` on each move.
export function watchPosition(onUpdate, onError, { highAccuracy = true } = {}) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError && onError(new Error('geo:unsupported'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => { if (isValidCoordinates(pos.coords.latitude, pos.coords.longitude)) onUpdate({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy_m: pos.coords.accuracy,
      heading: pos.coords.heading || null,
      speed_kmh: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : null,
    }); },
    (err) => onError && onError(err),
    { enableHighAccuracy: highAccuracy, timeout: 20000, maximumAge: 4000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}
