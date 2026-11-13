// Required fields of the «طلب خدمة» form chosen in «حقول النماذج» (AYK-218). Mirrors
// client/src/data/formFields.js: a hidden field is never required, core fields are checked elsewhere.
const Setting = require('../models/Setting');

const REQUIRABLE = { request: ['service', 'title', 'voice', 'attachments'], account_type: ['coverage'] };

const parse = value => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch (_) { return {}; }
};

async function requiredFields(form) {
  const [required, hidden] = await Promise.all([
    Setting.get('form_fields_required', {}).catch(() => ({})),
    Setting.get('form_fields_hidden', {}).catch(() => ({})),
  ]);
  const hiddenList = parse(hidden)[form];
  const hiddenSet = new Set(Array.isArray(hiddenList) ? hiddenList : []);
  const list = parse(required)[form];
  return new Set((Array.isArray(list) ? list : []).filter(key => (REQUIRABLE[form] || []).includes(key) && !hiddenSet.has(key)));
}

module.exports = { requiredFields, REQUIRABLE };
