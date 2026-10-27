import api from './api';

export async function listCategories() {
  const { data } = await api.get('/categories');
  return data.data;
}

export async function listServices(categoryId) {
  const params = {};
  if (categoryId) params.category_id = categoryId;
  const { data } = await api.get('/services', { params });
  return data.data;
}

export async function getService(id) {
  const { data } = await api.get(`/services/${id}`);
  return data.data;
}

// Public homepage stats — counts, views, activity. Cached server-side
// for 60s so it's cheap to call on every visit.
export async function getPublicStats() {
  const { data } = await api.get('/stats/public');
  return data.data;
}

export async function listRegions({ countryId } = {}) {
  const { data } = await api.get('/regions', { params: countryId ? { country_id: countryId } : {} });
  return Array.isArray(data?.data) ? data.data : [];
}

// Public list of enabled countries — used by register form, hero
// search, language switcher and currency formatter.
export async function listCountries() {
  try {
    const { data } = await api.get('/countries');
    if (Array.isArray(data?.data)) return data.data;
  } catch (_) {}
  return [];
}

// Reverse-geocode a GPS pair to { country, region, governorate,
// city } — used by the register form's "use my location" button.
export async function reverseGeocode({ lat, lon, signal }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const { data } = await api.get('/geo/reverse', {
      params: { lat, lon }, timeout: 8000, signal: controller.signal,
    });
    return data.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function listGovernorates(regionId) {
  const params = {};
  if (regionId) params.region_id = regionId;
  const { data } = await api.get('/governorates', { params });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function listCities({ governorateId, regionId } = {}) {
  const params = {};
  if (governorateId) params.governorate_id = governorateId;
  if (regionId) params.region_id = regionId;
  const { data } = await api.get('/cities', { params });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function listDistricts(cityId) {
  const params = {};
  if (cityId) params.city_id = cityId;
  const { data } = await api.get('/districts', { params });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function getPublicSettings() {
  const { data } = await api.get('/settings/public');
  return data.data;
}

// Address search inside Saudi Arabia (OpenStreetMap data via the server).
export async function searchAddress(q, { signal } = {}) {
  const { data } = await api.get('/geo/search', { params: { q }, timeout: 10000, signal });
  return data.data.results;
}

export async function listNearbyProviders({ lat, lon, radiusKm, categoryId, serviceId, signal } = {}) {
  const params = { lat, lon, radius_km: radiusKm };
  if (categoryId) params.category_id = categoryId;
  if (serviceId) params.service_id = serviceId;
  const { data } = await api.get('/providers/nearby', { params, signal });
  return data.data;
}
