export function isValidCoordinates(lat, lon) {
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    typeof lon === 'number' && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

// Completing an unresolved address does not move an explicitly chosen pin.
// Replacing any existing area, or clearing one, invalidates that old pin.
export function preserveCoordinatesForAreaChange(form, changes) {
  return isValidCoordinates(form.latitude, form.longitude) && Object.entries(changes).every(([key, value]) => {
    const previous = form[key];
    const hadValue = previous != null && String(previous) !== '';
    return !hadValue || String(previous) === String(value ?? '');
  });
}

function abortError() {
  return new DOMException('Location request cancelled', 'AbortError');
}

// Browser timeouts may not start while a permission prompt is unanswered.
// This deadline covers that prompt too, and ignores callbacks after cancellation.
export function getCurrentPosition({
  signal, timeoutMs = 10000,
  geolocation = globalThis.navigator?.geolocation,
} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    if (!geolocation) { reject(Object.assign(new Error('Geolocation unavailable'), { code: 2 })); return; }
    let settled = false;
    let timer;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError());
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(reject, Object.assign(new Error('Location timed out'), { code: 3 })), timeoutMs);
    try {
      geolocation.getCurrentPosition(
        position => {
          const { latitude, longitude } = position?.coords || {};
          if (!isValidCoordinates(latitude, longitude)) {
            finish(reject, Object.assign(new Error('Invalid coordinates'), { code: 2 }));
          } else finish(resolve, position);
        },
        error => finish(reject, error),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 },
      );
    } catch (error) { finish(reject, error); }
  });
}

// Keep only a coherent hierarchy from the reverse endpoint. A region-only city
// is valid; a neighborhood from a different city never is.
export function geoSelection(result) {
  const country = result?.country?.id ? result.country : null;
  const region = country && Number(result?.region?.country_id) === Number(country.id) ? result.region : null;
  const governorate = region && Number(result?.governorate?.region_id) === Number(region.id) ? result.governorate : null;
  const candidateCity = result?.city;
  const city = region && Number(candidateCity?.region_id) === Number(region.id) &&
    (candidateCity?.governorate_id == null ? !governorate : Number(candidateCity.governorate_id) === Number(governorate?.id))
    ? candidateCity : null;
  const district = city && Number(result?.district?.city_id) === Number(city.id) ? result.district : null;
  return { country, region, governorate, city, district };
}
