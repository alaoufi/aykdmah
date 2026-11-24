// AYK-481: the administration's three switches for how a provider's status is shown, read from the
// settings (presence_visible, availability_visible, availability_needs_alerts). The availability
// calculation is synchronous and runs in many places, so the values are kept here and renewed every
// 5 seconds in the background (the same freshness the settings model gives). All default to ON.
const Setting = require('../models/Setting');

let policy = { presence: true, availability: true, alerts: true };
const on = value => ![false, 'false', 0, '0'].includes(value);

async function refresh() {
  try {
    const v = await Setting.getMany(['presence_visible', 'availability_visible', 'availability_needs_alerts']);
    policy = { presence: on(v.presence_visible ?? true), availability: on(v.availability_visible ?? true), alerts: on(v.availability_needs_alerts ?? true) };
  } catch (_) { /* keep the last known values */ }
  return policy;
}

const current = () => policy;
// Renewed every 5 seconds (a quarter second in tests, which switch the settings and expect it soon).
refresh();
setInterval(refresh, process.env.NODE_ENV === 'test' ? 250 : 5000).unref();

// A person's «متصل» and «آخر ظهور» removed from an object, when the administration switched them off.
function stripPresence(object) {
  if (!policy.presence && object && typeof object === 'object') { object.is_online = 0; delete object.last_seen_at; }
  return object;
}

module.exports = { refresh, current, stripPresence };
