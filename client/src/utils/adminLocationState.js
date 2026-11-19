const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647 ? Number(value) : null;
const sanitize = (value = {}) => ({
  countryId: validId(value.countryId), regionId: validId(value.regionId), cityId: validId(value.cityId),
  search: typeof value.search === 'string' ? value.search.slice(0, 200) : '',
  scroll: Object.fromEntries(Object.entries(value.scroll && typeof value.scroll === 'object' ? value.scroll : {})
    .filter(([key, y]) => key.length < 80 && Number.isFinite(y) && y >= 0).slice(-100)),
});
export const adminLocationKey = userId => `ayk:admin:locations:v1:${validId(userId) || 'anonymous'}`;
export function readAdminLocationState(storage, userId) {
  try { return sanitize(JSON.parse(storage?.getItem(adminLocationKey(userId)) || '{}') || {}); }
  catch { return sanitize(); }
}
export function writeAdminLocationState(storage, userId, state) {
  if (!validId(userId)) return;
  try { storage?.setItem(adminLocationKey(userId), JSON.stringify(sanitize(state))); } catch { /* Storage may be unavailable. */ }
}
