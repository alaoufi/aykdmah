import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentPosition, isValidCoordinates, geoSelection, preserveCoordinatesForAreaChange } from '../src/utils/geolocation.mjs';

test('an unanswered browser permission prompt has a real deadline', async () => {
  let lateSuccess;
  const result = getCurrentPosition({ timeoutMs: 20, geolocation: { getCurrentPosition(success) { lateSuccess = success; } } });
  await assert.rejects(result, error => error.code === 3);
  lateSuccess({ coords: { latitude: 25.9, longitude: 45.3 } });
  await assert.rejects(result, error => error.code === 3);
});

test('manual cancellation settles immediately and ignores a later GPS callback', async () => {
  let lateSuccess;
  const controller = new AbortController();
  const result = getCurrentPosition({ signal: controller.signal, timeoutMs: 1000,
    geolocation: { getCurrentPosition(success) { lateSuccess = success; } } });
  controller.abort();
  await assert.rejects(result, error => error.name === 'AbortError');
  lateSuccess({ coords: { latitude: 25.9, longitude: 45.3 } });
  await assert.rejects(result, error => error.name === 'AbortError');
});

test('real coordinates and permission denial are preserved, invalid GPS is rejected', async () => {
  const coords = { latitude: 0, longitude: 0 };
  assert.deepEqual((await getCurrentPosition({ geolocation: { getCurrentPosition(success) { success({ coords }); } } })).coords, coords);
  await assert.rejects(getCurrentPosition({ geolocation: { getCurrentPosition(_, failure) { failure({ code: 1 }); } } }), error => error.code === 1);
  await assert.rejects(getCurrentPosition({ geolocation: { getCurrentPosition(success) { success({ coords: { latitude: 100, longitude: 10 } }); } } }), error => error.code === 2);
  assert.equal(isValidCoordinates(null, 0), false);
  assert.equal(isValidCoordinates(0, Infinity), false);
});

test('a reverse response cannot apply an unrelated neighborhood or country hierarchy', () => {
  const result = { country: { id: 1 }, region: { id: 4, country_id: 1 }, governorate: { id: 46, region_id: 4 },
    city: { id: 9, region_id: 4, governorate_id: 46 }, district: { id: 10, city_id: 16 } };
  assert.equal(geoSelection(result).city.id, 9);
  assert.equal(geoSelection(result).district, null);
  assert.equal(geoSelection({ ...result, region: { id: 4, country_id: 2 } }).city, null);
  const regionOnly = geoSelection({ ...result, governorate: null, city: { id: 30, region_id: 4, governorate_id: null }, district: null });
  assert.equal(regionOnly.city.id, 30);
  assert.equal(regionOnly.governorate, null);
});

test('completing a manual address keeps a chosen pin, replacing existing areas clears it', () => {
  const form = { latitude: 26.326, longitude: 43.975, country_id: 1, region_id: 4,
    governorate_id: 46, city_id: 9, district_id: '' };
  assert.equal(preserveCoordinatesForAreaChange(form, { district_id: 10 }), true);
  assert.equal(preserveCoordinatesForAreaChange({ ...form, district_id: 10 }, { district_id: 11 }), false);
  assert.equal(preserveCoordinatesForAreaChange(form, { city_id: 16, district_id: '' }), false);
  assert.equal(preserveCoordinatesForAreaChange(form, { region_id: 1, governorate_id: '', city_id: '', district_id: '' }), false);
  assert.equal(preserveCoordinatesForAreaChange({ ...form, region_id: '', governorate_id: '', city_id: '' },
    { region_id: 4, governorate_id: '', city_id: '', district_id: '' }), true);
  assert.equal(preserveCoordinatesForAreaChange({ ...form, latitude: null, longitude: null }, { district_id: 10 }), false);
});
