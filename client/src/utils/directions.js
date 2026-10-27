// Opens turn-by-turn navigation in the device's maps app (or Google Maps on the web).
// A plain link, no API key or usage billing.
export function directionsUrl(latitude, longitude) {
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
}

export function formatDistanceKm(km, t) {
  if (km == null || !Number.isFinite(Number(km))) return '';
  const value = Number(km);
  return value < 1 ? t('map.distance_m', { value: Math.round(value * 1000) }) : t('map.distance_km', { value: value.toFixed(1) });
}
