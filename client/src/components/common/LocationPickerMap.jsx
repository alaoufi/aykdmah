import { localizedName } from '../../utils/localize';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, Marker, useMapEvents } from 'react-leaflet';
import BaseTileLayer from '../map/BaseTileLayer';
import { listCities, reverseGeocode, searchAddress } from '../../services/serviceService';
import { getCurrentPosition, isValidCoordinates } from '../../utils/geolocation.mjs';
import { icon } from 'leaflet';
import markerImage from 'leaflet/dist/images/marker-icon.png';
import markerImage2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

const pinIcon = icon({ iconUrl: markerImage, iconRetinaUrl: markerImage2x, shadowUrl: markerShadow,
  iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] });
// A viewing center only. It is never saved until the user explicitly picks it.
const DEFAULT_PIN = { lat: 26.326, lon: 43.975 };

// Tiny inner component that captures clicks on the map and bubbles
// the lat/lon up to the parent. react-leaflet requires hook-based
// event handlers inside a child of MapContainer.
function Picker({ onPick }) {
  useMapEvents({
    click(e) { onPick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

// Full-screen modal with a Leaflet map. The user clicks anywhere to
// drop a pin; the parent receives the resolved
//   { lat, lon, country, region, governorate, city, district? }
// shape via onConfirm so the register form can pre-fill its cascade.
export default function LocationPickerMap({ open, onClose, onConfirm, initialLat, initialLon, initialPointSelected = false }) {
  const { t, i18n } = useTranslation();
  const initialPin = isValidCoordinates(initialLat, initialLon)
    ? { lat: initialLat, lon: initialLon } : DEFAULT_PIN;
  const [pin, setPin] = useState(initialPin);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [chosen, setChosen] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const searchRef = useRef(null);
  const mapRef = useRef(null);
  const lookupRef = useRef(null);
  const gpsRef = useRef(null);
  const requestRef = useRef(0);
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const cancel = useCallback(() => {
    requestRef.current += 1;
    lookupRef.current?.abort();
    gpsRef.current?.abort();
  }, []);

  const pick = useCallback(async (lat, lon) => {
    if (!isValidCoordinates(lat, lon)) return;
    gpsRef.current?.abort(); // A deliberate map click takes priority over pending GPS.
    setLocating(false);
    lookupRef.current?.abort();
    const request = ++requestRef.current;
    const controller = new AbortController();
    lookupRef.current = controller;
    setPin({ lat, lon });
    setChosen(true);
    setGpsError(null);
    setResult(null); // Never leave a previous point's address available for confirmation.
    setLoading(true);
    try {
      const resolved = await reverseGeocode({ lat, lon, signal: controller.signal });
      if (request === requestRef.current && !controller.signal.aborted) setResult(resolved);
    } catch (_) {
      // Coordinates remain usable when the optional address service is unavailable.
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    cancel();
    const validInitial = isValidCoordinates(initialLat, initialLon);
    setPin(validInitial ? { lat: initialLat, lon: initialLon } : DEFAULT_PIN);
    setResult(null);
    setChosen(validInitial && initialPointSelected);
    setLoading(false);
    setLocating(false);
    setGpsError(null);
    // An existing pin or an explicitly selected city's center takes priority.
    // With no location yet, use the active launch city's actual API coordinates.
    if (validInitial) {
      mapRef.current?.setView([initialLat, initialLon], 13);
      return cancel;
    }
    const initialRequest = requestRef.current;
    listCities({}).then(cities => {
      if (initialRequest !== requestRef.current) return;
      const city = cities.find(row => Number(row.id) === 9);
      if (city?.latitude == null || city?.longitude == null) return;
      const lat = Number(city.latitude), lon = Number(city.longitude);
      if (!isValidCoordinates(lat, lon)) return;
      setPin({ lat, lon });
      mapRef.current?.flyTo([lat, lon], 11);
    }).catch(() => { /* Keep the viewing center; no coordinates are assigned. */ });
    return cancel;
  }, [open, initialLat, initialLon, initialPointSelected, cancel]);

  const useMyLocation = async () => {
    cancel();
    const request = requestRef.current;
    const controller = new AbortController();
    gpsRef.current = controller;
    setLoading(false);
    setLocating(true);
    setGpsError(null);
    try {
      const position = await getCurrentPosition({ signal: controller.signal });
      if (controller.signal.aborted || request !== requestRef.current) return;
      const lat = position.coords.latitude, lon = position.coords.longitude;
      mapRef.current?.flyTo([lat, lon], 13);
      await pick(lat, lon);
    } catch (error) {
      if (!controller.signal.aborted && request === requestRef.current) {
        setGpsError(error.code === 1 ? 'auth.location_denied' : error.code === 3 ? 'auth.location_timeout' : 'auth.location_failed');
      }
    } finally {
      if (request === requestRef.current) setLocating(false);
    }
  };

  // Search runs on submit only (no autocomplete), as the OpenStreetMap usage policy requires.
  const runSearch = async event => {
    event.preventDefault();
    const q = searchText.trim();
    if (q.length < 3 || searching) return;
    searchRef.current?.abort();
    const controller = new AbortController();
    searchRef.current = controller;
    setSearching(true);
    setSearchError(null);
    setSearchResults(null);
    try {
      const results = await searchAddress(q, { signal: controller.signal });
      if (!controller.signal.aborted) setSearchResults(results);
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error?.response?.status === 429 ? 'map.search_rate_limited' : 'map.search_failed');
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  const chooseResult = result => {
    setSearchResults(null);
    mapRef.current?.flyTo([result.latitude, result.longitude], 16);
    pick(result.latitude, result.longitude);
  };

  const close = useCallback(() => { cancel(); searchRef.current?.abort(); onCloseRef.current?.(); }, [cancel]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector('button')?.focus());
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll('a[href], button, input, select, [tabindex]') || [])
        .filter(item => !item.disabled && item.tabIndex >= 0 && item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, close]);

  const unchangedPoint = initialPointSelected && pin.lat === initialLat && pin.lon === initialLon;

  if (!open) return null;

  return createPortal(
    <div data-testid="location-picker-map" className="fixed inset-0 z-[1000] bg-black/60 grid place-items-center p-2 md:p-4"
      onClick={event => { event.stopPropagation(); close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="location-picker-title"
        className="bg-surface rounded-card shadow-lift w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden"
        style={{ maxHeight: '92dvh' }} onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
          <div>
            <div id="location-picker-title" className="font-extrabold text-fg text-[15px]">{t('auth.pick_on_map')}</div>
            <div className="text-[11.5px] text-fg-subtle">{t('auth.pick_on_map_hint')}</div>
          </div>
          <button type="button" aria-label={t('common.close')} onClick={close} className="px-3 py-1 rounded-pill bg-surface-alt hover:bg-border text-fg-muted text-[12.5px] font-semibold">✕</button>
        </div>

        <form onSubmit={runSearch} className="px-4 pt-3 pb-2 border-b border-border relative">
          <div className="flex gap-2">
            <input type="search" name="address_search" value={searchText} maxLength={120}
              onChange={event => setSearchText(event.target.value)}
              placeholder={t('map.search_placeholder')} aria-label={t('map.search_placeholder')}
              className="input flex-1 min-w-0 text-[13.5px]" />
            <button type="submit" disabled={searching || searchText.trim().length < 3}
              className="px-4 py-2 rounded-pill bg-primary-grad text-primary-fg font-bold text-[13px] disabled:opacity-60 shrink-0">
              {searching ? t('map.searching') : t('map.search')}
            </button>
          </div>
          {searchError && <div className="text-[12px] text-amber-700 mt-1">{t(searchError)}</div>}
          {searchResults && (
            <ul className="absolute inset-x-4 top-full z-[1100] mt-1 max-h-56 overflow-auto rounded-card bg-surface border border-border shadow-lift">
              {searchResults.length === 0 && <li className="px-3 py-2 text-[12.5px] text-fg-muted">{t('map.search_no_results')}</li>}
              {searchResults.map(result => (
                <li key={`${result.latitude},${result.longitude}`}>
                  <button type="button" onClick={() => chooseResult(result)}
                    className="w-full text-start px-3 py-2 text-[12.5px] hover:bg-surface-alt">{result.label}</button>
                </li>
              ))}
              <li className="px-3 py-1 text-[10.5px] text-fg-subtle border-t border-border">© OpenStreetMap</li>
            </ul>
          )}
        </form>

        <div className="relative h-[50vh] max-h-[420px]" style={{ height: '50dvh', minHeight: 200 }}>
          <MapContainer
            center={[initialPin.lat, initialPin.lon]}
            zoom={isValidCoordinates(initialLat, initialLon) ? 13 : 11}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
          >
            <BaseTileLayer />
            {chosen && <Marker position={[pin.lat, pin.lon]} icon={pinIcon} draggable
              eventHandlers={{ dragend: event => { const point = event.target.getLatLng(); pick(point.lat, point.lng); } }} />}
            <Picker onPick={pick} />
          </MapContainer>
        </div>

        <div className="px-4 py-3 border-t border-border bg-surface-alt">
          <button type="button" onClick={useMyLocation} disabled={locating}
            className="mb-2 px-3 py-2 rounded-pill text-sm text-fg bg-surface border border-border disabled:opacity-60">
            📍 {locating ? t('auth.locating') : t('auth.use_my_location')}
          </button>
          {loading ? (
            <div className="text-[12.5px] text-fg-muted animate-pulse">⏳ {t('auth.locating')}</div>
          ) : result?.country ? (
            <div className="space-y-1 text-[12.5px]">
              <div>
                {result.country.flag_emoji} <b>{localizedName(result.country, i18n.resolvedLanguage)}</b>
                {result.country.currency_symbol && <span className="text-fg-subtle"> • {i18n.resolvedLanguage === 'ar' ? result.country.currency_symbol : result.country.currency_code || t('common.currency')}</span>}
              </div>
              <div className="text-fg-muted">
                {[result.region, result.governorate, result.city].map(item => localizedName(item, i18n.resolvedLanguage)).filter(Boolean).join(' • ') || t('auth.location_area_unknown')}
              </div>
              {!result.city && <div className="text-amber-700">{t('auth.location_area_unknown')}</div>}
            </div>
          ) : chosen ? (
            <div className={`text-[12.5px] ${unchangedPoint ? 'text-fg-muted' : 'text-amber-700'}`}>
              {t(unchangedPoint ? 'location.location_captured' : 'auth.location_area_unknown')}
              {result?.raw?.country_name && <span className="block opacity-70">{result.raw.country_name}</span>}
            </div>
          ) : (
            <div className="text-[12.5px] text-fg-muted">{t('auth.pick_on_map_tap')}</div>
          )}
          {gpsError && <div className="text-[12px] text-amber-700 mt-1">{t(gpsError)}</div>}
          {result?.best_effort && <div className="text-[12px] text-amber-700 mt-1">{t('auth.location_best_effort')}</div>}
          {chosen && <div className="text-[11px] text-fg-subtle mt-1" dir="ltr">{pin.lat.toFixed(6)}, {pin.lon.toFixed(6)}</div>}
        </div>

        <div className="px-4 py-3 flex gap-2">
          <button type="button" onClick={close}
            className="flex-1 px-4 py-2.5 rounded-pill bg-surface-alt text-fg font-semibold text-[13.5px]">
            {t('admin.cancel_btn')}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!chosen || loading || locating || !isValidCoordinates(pin.lat, pin.lon)) return;
              onConfirm({ ...result, lat: pin.lat, lon: pin.lon, result });
              close();
            }}
            disabled={!chosen || loading || locating || !isValidCoordinates(pin.lat, pin.lon)}
            className="flex-1 px-4 py-2.5 rounded-pill text-primary-fg font-bold text-[13.5px] shadow-soft bg-primary-grad disabled:opacity-60">
            ✓ {t('common.confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
