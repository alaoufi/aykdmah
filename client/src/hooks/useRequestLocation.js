import { useCallback, useEffect, useRef, useState } from 'react';
import { listCountries, listRegions, listGovernorates, listCities, reverseGeocode } from '../services/serviceService';
import useLocationOptions from './useLocationOptions';
import { getCurrentPosition, geoSelection, isValidCoordinates } from '../utils/geolocation.mjs';
import {
  REQUEST_LOCATION_LEVELS, activeLocationRow, findLocation, locationId, locationPoint,
  emptyRequestLocation, initialRequestLocation, savedRequestLocation, requestCityLocation,
  changeRequestLocation, validateRequestDistrict, completeRequestLocation,
} from '../utils/requestLocation';

const EMPTY_CATALOG = { countries: [], regions: [], governorates: [], cities: [] };

export default function useRequestLocation({ user, params, enabled = true, fallbackCountryId }) {
  const owner = String(user?.id || '');
  const query = params?.toString?.() || '';
  const userSignature = JSON.stringify([owner, ...REQUEST_LOCATION_LEVELS.map(key => user?.[key]), user?.address, user?.latitude, user?.longitude]);
  const [catalogState, setCatalogState] = useState({ owner: '', loading: true, error: false, rows: EMPTY_CATALOG });
  const [reload, setReload] = useState(0);
  const [location, setLocation] = useState(emptyRequestLocation);
  const [source, setSource] = useState('empty');
  const [remember, setRemember] = useState(false);
  const [editing, setEditing] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const dirty = useRef(false);
  const touched = useRef(new Set());
  const freshPoint = useRef(false);
  const applied = useRef('');
  const revision = useRef(0);
  const controller = useRef(null);
  const latestLocation = useRef(location);
  latestLocation.current = location;

  const cancelPending = useCallback(() => {
    revision.current += 1;
    controller.current?.abort();
    controller.current = null;
    setLocating(false);
  }, []);
  useEffect(() => () => { revision.current += 1; controller.current?.abort(); }, []);
  useEffect(() => {
    cancelPending();
    dirty.current = false;
    touched.current.clear();
    freshPoint.current = false;
    applied.current = '';
    setLocation(emptyRequestLocation());
    setSource('empty');
    setRemember(false);
    setEditing(false);
    setLocationMessage('');
  }, [owner, enabled, cancelPending]);

  useEffect(() => {
    if (!enabled || !owner) return undefined;
    let current = true;
    setCatalogState({ owner, loading: true, error: false, rows: EMPTY_CATALOG });
    Promise.all([listCountries(), listRegions(), listGovernorates(), listCities()])
      .then(([countries, regions, governorates, cities]) => {
        if (!countries.length) throw new Error('Active countries unavailable');
        if (current) setCatalogState({ owner, loading: false, error: false, rows: { countries, regions, governorates, cities } });
      })
      .catch(() => { if (current) setCatalogState({ owner, loading: false, error: true, rows: EMPTY_CATALOG }); });
    return () => { current = false; };
  }, [owner, enabled, reload]);

  const catalogReady = enabled && catalogState.owner === owner && !catalogState.loading && !catalogState.error;
  const catalog = catalogReady ? catalogState.rows : EMPTY_CATALOG;
  // Only one active country: preselect it so the choice starts at the region.
  useEffect(() => {
    if (catalog.countries.length === 1 && !location.country_id) {
      setLocation(previous => (previous.country_id ? previous : { ...previous, country_id: locationId(catalog.countries[0].id) }));
    }
  }, [catalog.countries, location.country_id]);
  const { rows: districts, loading: districtsLoading, error: districtsError } = useLocationOptions('districts', location.city_id, enabled && Boolean(owner), reload);

  useEffect(() => {
    if (!catalogReady || dirty.current) return;
    const signature = `${userSignature}:${query}:${fallbackCountryId || ''}:${reload}`;
    if (applied.current === signature) return;
    applied.current = signature;
    const initial = initialRequestLocation({ user, params, catalog, fallbackCountryId });
    cancelPending();
    freshPoint.current = false;
    setLocation(initial.location);
    setSource(initial.source);
  }, [catalogReady, catalog, userSignature, query, fallbackCountryId, reload, cancelPending]);

  useEffect(() => {
    if (!location.city_id || districtsLoading || districtsError) return;
    const validated = validateRequestDistrict(location, districts);
    if (validated === location) return;
    cancelPending();
    setLocation(previous => {
      // A newer manual city choice cannot be invalidated by an older district response.
      if (previous.city_id !== location.city_id || previous.district_id !== location.district_id) return previous;
      return { ...validated, ...(touched.current.has('address') ? { address: previous.address } : {}) };
    });
  }, [location, districts, districtsLoading, districtsError, cancelPending]);

  const accountLocation = savedRequestLocation(user, catalog);
  const hasPoint = Boolean(locationPoint(location));
  const ready = catalogReady && !districtsLoading && !districtsError;
  const complete = Boolean(requestCityLocation(location.city_id, catalog)) && completeRequestLocation(location, districts, ready);
  const manualDistrict = Boolean(location.city_id) && ready && districts.length === 0;
  const countries = catalog.countries.filter(activeLocationRow);
  const regions = catalog.regions.filter(row => activeLocationRow(row) && locationId(row.country_id) === location.country_id);
  const governorates = catalog.governorates.filter(row => activeLocationRow(row) && locationId(row.region_id) === location.region_id);
  const cities = catalog.cities.filter(row => {
    const resolved = requestCityLocation(row.id, catalog);
    // Every city of the region: the governorate step is skipped (it follows the city).
    return resolved && resolved.country_id === location.country_id && resolved.region_id === location.region_id;
  });

  const change = (key, value) => {
    cancelPending();
    dirty.current = true;
    touched.current.add(key);
    setSource('manual');
    setLocationMessage('');
    setRemember(false);
    const preserveFreshPoint = freshPoint.current;
    if (key !== 'address' && !locationPoint(changeRequestLocation(latestLocation.current, key, value, catalog, { preserveFreshPoint }))) freshPoint.current = false;
    setLocation(previous => changeRequestLocation(previous, key, value, catalog, { preserveFreshPoint }));
  };
  const useAccount = () => {
    if (!accountLocation) return;
    cancelPending();
    dirty.current = true;
    touched.current.clear();
    freshPoint.current = false;
    setSource('saved');
    setLocationMessage('');
    setRemember(false);
    setLocation(accountLocation);
  };
  const clearPoint = () => {
    cancelPending(); dirty.current = true; freshPoint.current = false; setRemember(false); setSource('manual');
    setLocation(previous => ({ ...previous, latitude: null, longitude: null }));
  };
  const beginPoint = (latitude, longitude) => {
    dirty.current = true;
    freshPoint.current = true;
    setSource('point');
    setRemember(false);
    const previous = latestLocation.current;
    const oldPoint = locationPoint(previous);
    const unchanged = oldPoint && oldPoint.latitude === latitude && oldPoint.longitude === longitude;
    setLocation(current => ({
      ...current,
      ...(unchanged ? {} : { ...Object.fromEntries(REQUEST_LOCATION_LEVELS.slice(1).map(key => [key, ''])), address: touched.current.has('address') ? current.address : '' }),
      latitude, longitude,
    }));
    return unchanged;
  };
  const applyResolved = (latitude, longitude, result) => {
    const selection = geoSelection(result);
    const resolved = selection.city && requestCityLocation(selection.city.id, catalog);
    if (!resolved) {
      setLocationMessage('auth.location_area_unknown');
      return;
    }
    const selectedDistrict = selection.district && locationId(selection.district.city_id) === resolved.city_id ? locationId(selection.district.id) : '';
    setLocation(current => ({ ...current, ...resolved, district_id: selectedDistrict, latitude, longitude, address: current.address }));
    setLocationMessage(result?.best_effort ? 'auth.location_best_effort' : 'location.location_captured');
  };
  const useDeviceLocation = async () => {
    cancelPending();
    dirty.current = true;
    const request = revision.current;
    const pending = new AbortController();
    controller.current = pending;
    setLocating(true); setLocationMessage('');
    try {
      const position = await getCurrentPosition({ signal: pending.signal });
      if (request !== revision.current || pending.signal.aborted) return;
      const { latitude, longitude } = position.coords;
      const unchanged = beginPoint(latitude, longitude);
      try {
        const result = await reverseGeocode({ lat: latitude, lon: longitude, signal: pending.signal });
        if (request === revision.current && !pending.signal.aborted) applyResolved(latitude, longitude, result);
      } catch (_) {
        if (request === revision.current && !pending.signal.aborted) setLocationMessage(unchanged ? 'location.location_captured' : 'auth.location_area_unknown');
      }
    } catch (error) {
      if (request === revision.current && !pending.signal.aborted) setLocationMessage(error.code === 1 ? 'auth.location_denied' : 'auth.location_failed');
    } finally { if (request === revision.current) setLocating(false); }
  };
  const confirmMapPoint = ({ lat, lon, result }) => {
    if (!isValidCoordinates(lat, lon)) return;
    cancelPending();
    const unchanged = beginPoint(lat, lon);
    if (result) applyResolved(lat, lon, result);
    else setLocationMessage(unchanged ? 'location.location_captured' : 'auth.location_area_unknown');
  };

  return {
    location, source, remember: remember && complete, setRemember: value => setRemember(Boolean(value) && complete),
    editing: editing || (!complete && ready), setEditing,
    loading: enabled && (!catalogReady && !catalogState.error || districtsLoading),
    error: catalogState.error || districtsError, retry: () => setReload(value => value + 1),
    ready, complete, hasPoint, manualDistrict, locating, locationMessage,
    countries, regions, governorates, cities, districts,
    city: findLocation(catalog.cities, location.city_id), district: findLocation(districts, location.district_id),
    accountAvailable: Boolean(accountLocation), cancelPending,
    change, useAccount, clearPoint, useDeviceLocation, confirmMapPoint,
  };
}
