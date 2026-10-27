import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyRequestLocation, locationPoint, requestCityLocation, savedRequestLocation,
  initialRequestLocation, changeRequestLocation, validateRequestDistrict,
  completeRequestLocation, requestLocationFields, appendRequestLocation,
} from '../src/utils/requestLocation.js';

const catalog = {
  countries: [{ id: 1, is_active: 1 }],
  regions: [{ id: 4, country_id: 1, is_active: 1 }, { id: 5, country_id: 1, is_active: 1 }],
  governorates: [{ id: 9, region_id: 4, is_active: 1 }, { id: 10, region_id: 5, is_active: 1 }],
  cities: [
    { id: 21, governorate_id: 9, region_id: null, latitude: 26.3, longitude: 43.9, is_active: 1 },
    { id: 22, governorate_id: null, region_id: 5, latitude: 25.9, longitude: 45.2, is_active: 1 },
  ],
};
const districts = [{ id: 31, city_id: 21, is_active: 1 }, { id: 32, city_id: 21, is_active: 1 }];
const home = Object.freeze({ id: 7, country_id: 1, region_id: 4, governorate_id: 9, city_id: 21, district_id: 31, address: 'Building 4, Home Street', latitude: '0', longitude: '0' });
const from = (params = '', user = home) => initialRequestLocation({ user, params: new URLSearchParams(params), catalog }).location;

test('saved account defaults use their exact address and zero-valued pin instead of the city center', () => {
  const location = from();
  assert.equal(location.city_id, '21'); assert.equal(location.district_id, '31');
  assert.equal(location.region_id, '4'); assert.equal(location.governorate_id, '9');
  assert.equal(location.address, home.address);
  assert.deepEqual(locationPoint(location), { latitude: 0, longitude: 0 });
  assert.equal(completeRequestLocation(location, districts), true);
  assert.equal(home.latitude, '0');
  const legacy = from('', { ...home, latitude: null, longitude: null });
  assert.equal(locationPoint(legacy), null);
  assert.equal(completeRequestLocation(legacy, districts), false);
  assert.deepEqual(locationPoint({ latitude: '', longitude: '' }), null);
  assert.deepEqual(locationPoint({ latitude: null, longitude: null }), null);
});

test('a valid explicit search area wins without attaching the saved home pin or address to another city or district', () => {
  const differentCity = from('city=22&district=41');
  assert.equal(differentCity.city_id, '22'); assert.equal(differentCity.region_id, '5');
  assert.equal(differentCity.governorate_id, '');
  assert.equal(differentCity.district_id, '41');
  assert.equal(differentCity.address, ''); assert.equal(locationPoint(differentCity), null);
  const otherNeighborhood = from('city=21&district=32');
  assert.equal(otherNeighborhood.city_id, '21'); assert.equal(otherNeighborhood.district_id, '32');
  assert.equal(otherNeighborhood.address, ''); assert.equal(locationPoint(otherNeighborhood), null);
  const sameHome = from('city=21&district=31');
  assert.equal(sameHome.address, home.address);
  assert.deepEqual(locationPoint(sameHome), { latitude: 0, longitude: 0 });
  assert.equal(from('city=99999').city_id, '21');
  assert.equal(from('city=22&region=4').city_id, '21');
});

test('inactive or inconsistent saved hierarchy and stale neighborhoods cannot become remembered location defaults', () => {
  assert.equal(savedRequestLocation({ ...home, region_id: 5 }, catalog), null);
  assert.equal(savedRequestLocation(home, { ...catalog, countries: [{ id: 1, is_active: 0 }] }), null);
  assert.equal(requestCityLocation(21, { ...catalog, governorates: [] }), null);
  const mismatched = { ...catalog, cities: [{ ...catalog.cities[0], region_id: 5 }] };
  assert.equal(requestCityLocation(21, mismatched), null);
  const invalidDistrict = validateRequestDistrict({ ...from(), district_id: '99' }, districts);
  assert.equal(invalidDistrict.district_id, ''); assert.equal(invalidDistrict.address, '');
  assert.equal(locationPoint(invalidDistrict), null);
  assert.equal(completeRequestLocation(from(), [{ id: 31, city_id: 22 }]), false);
  assert.equal(completeRequestLocation(from(), districts, false), false);
});

test('changing area or a saved address removes stale GPS while an explicitly chosen fresh pin survives completing its address', () => {
  const differentCity = changeRequestLocation(from(), 'city_id', '22', catalog);
  assert.equal(differentCity.city_id, '22'); assert.equal(differentCity.district_id, '');
  assert.equal(differentCity.address, ''); assert.equal(locationPoint(differentCity), null);
  const otherDistrict = changeRequestLocation(from(), 'district_id', '32', catalog);
  assert.equal(otherDistrict.address, ''); assert.equal(locationPoint(otherDistrict), null);
  const changedAddress = changeRequestLocation(from(), 'address', 'A different address', catalog);
  assert.equal(locationPoint(changedAddress), null);
  const freshPoint = changeRequestLocation({ ...from(), address: '' }, 'address', 'The freshly selected work address', catalog, { preserveFreshPoint: true });
  assert.deepEqual(locationPoint(freshPoint), { latitude: 0, longitude: 0 });
  assert.equal(completeRequestLocation(freshPoint, districts), true);
  const unresolvedPin = { ...emptyRequestLocation(), country_id: '1', latitude: 0, longitude: 0 };
  assert.deepEqual(locationPoint(changeRequestLocation(unresolvedPin, 'city_id', '21', catalog, { preserveFreshPoint: true })), { latitude: 0, longitude: 0 });
  const legacySavedArea = { ...from(), district_id: '' };
  assert.equal(locationPoint(changeRequestLocation(legacySavedArea, 'district_id', '31', catalog)), null);
});

test('request serialization keeps account identity private, preserves precise coordinates and sends explicit remember intent only', () => {
  const location = from();
  const oneOff = requestLocationFields(location);
  assert.equal(oneOff.remember_location, false);
  assert.equal(oneOff.latitude, 0); assert.equal(oneOff.longitude, 0);
  assert.equal(oneOff.address, home.address);
  assert.equal('id' in oneOff, false);
  assert.equal('password' in oneOff, false);
  const remembered = requestLocationFields(location, true);
  assert.equal(remembered.remember_location, true);
  assert.deepEqual(location, from());
  assert.equal(requestLocationFields({ ...location, latitude: 91 }).latitude, null);
  assert.equal(requestLocationFields({ ...location, latitude: 91 }).longitude, null);
});

test('cleared request location is explicitly serialized so saved home fields cannot be inherited again', () => {
  const cleared = { ...from(), address: '', district_id: '', latitude: null, longitude: null };
  const data = appendRequestLocation(new FormData(), requestLocationFields(cleared));
  for (const key of ['address', 'district_id', 'latitude', 'longitude']) {
    assert.equal(data.has(key), true, `${key} must be present even after clearing`);
    assert.equal(data.get(key), '');
  }
  assert.equal(data.get('remember_location'), 'false');
  assert.equal(data.get('city_id'), '21');
  const exact = appendRequestLocation(new FormData(), requestLocationFields(from(), true));
  assert.equal(exact.get('latitude'), '0');
  assert.equal(exact.get('longitude'), '0');
  assert.equal(exact.get('remember_location'), 'true');
});
