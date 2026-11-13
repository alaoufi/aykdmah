function distanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  if ([lat1, lon1, lat2, lon2].some(value => !['number', 'string'].includes(typeof value) || String(value).trim() === '')) return null;
  lat1 = Number(lat1); lon1 = Number(lon1); lat2 = Number(lat2); lon2 = Number(lon2);
  if (!isValidLatLng(lat1, lon1) || !isValidLatLng(lat2, lon2)) return null;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const clamped = Math.max(0, Math.min(1, a));
  const c = 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return R * c;
}

function isValidLatLng(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

module.exports = { distanceKm, isValidLatLng };
