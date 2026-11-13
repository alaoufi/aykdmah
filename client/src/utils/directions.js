// Opens turn-by-turn navigation in the device's maps app (or Google Maps on the web).
// A plain link, no API key or usage billing.
export function directionsUrl(latitude, longitude) {
  return `https://www.google.com/maps/dir/?api=1&destination=${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
}

// A request's place in Google Maps (AYK-044): the exact point when this viewer may
// see it (the requester, the agreed provider), otherwise the district and city by name.
export function requestMapsUrl(request) {
  if (!request) return '';
  if (request.latitude != null && request.longitude != null) return directionsUrl(request.latitude, request.longitude);
  const area = [request.district_name, request.city_name].filter(Boolean).join('، ');
  return area ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(area)}` : '';
}

export function formatDistanceKm(km, t) {
  if (km == null || !Number.isFinite(Number(km))) return '';
  const value = Number(km);
  return value < 1 ? t('map.distance_m', { value: Math.round(value * 1000) }) : t('map.distance_km', { value: value.toFixed(1) });
}
