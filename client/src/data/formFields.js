// Fields of the forms whose optional parts the owner shows or hides from the admin area (AYK-215).
// A core field is needed for the form to work and can never be hidden. The hidden list is the
// public setting form_fields_hidden: { "request": ["title", …] }.
export const FORM_FIELDS = Object.freeze({
  request: [
    { key: 'category', labelKey: 'requester.profession', core: true },
    { key: 'service', labelKey: 'requester.sub_service', requirable: true },
    { key: 'title', labelKey: 'requester.request_title', requirable: true },
    { key: 'voice', labelKey: 'requester.voice_label', requirable: true },
    { key: 'attachments', labelKey: 'requester.attach_label', requirable: true },
    { key: 'location', labelKey: 'admin.form_fields.location', core: true },
  ],
  // «نوع الحساب» in «ملفي» (AYK-217): the work details asked when a requester becomes a provider
  // (or both). A requester needs no field. Hidden coverage falls back to the account's own
  // district, a hidden service mode to «at the customer».
  account_type: [
    { key: 'professions', labelKey: 'provider.professions', core: true },
    { key: 'coverage', labelKey: 'provider.coverage', requirable: true },
    { key: 'location_mode', labelKey: 'provider.location_mode' },
  ],
});

export const FORM_NAMES = Object.freeze({ request: 'request.create_title', account_type: 'admin.form_fields.account_type' });

function parse(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || '{}') || {}; } catch (_) { return {}; }
}

// The hidden fields of one form, without unknown or core fields.
export function hiddenFields(setting, form) {
  const list = parse(setting)[form];
  const allowed = new Set((FORM_FIELDS[form] || []).filter(field => !field.core).map(field => field.key));
  return new Set((Array.isArray(list) ? list : []).filter(key => allowed.has(key)));
}

// The whole setting after showing or hiding one field.
export function toggleField(setting, form, key) {
  const current = parse(setting);
  const hidden = hiddenFields(current, form);
  if (hidden.has(key)) hidden.delete(key);
  else if ((FORM_FIELDS[form] || []).some(field => field.key === key && !field.core)) hidden.add(key);
  return { ...current, [form]: [...hidden] };
}

// Required fields (AYK-218): the public setting form_fields_required lists them per form. A hidden
// field is always optional; without the setting, coverage stays required as before.
const DEFAULT_REQUIRED = { account_type: ['coverage'] };

export function requiredFields(requiredSetting, hiddenSetting, form) {
  const source = requiredSetting === undefined || requiredSetting === null ? DEFAULT_REQUIRED : parse(requiredSetting);
  const list = source[form];
  const hidden = hiddenFields(hiddenSetting, form);
  const allowed = new Set((FORM_FIELDS[form] || []).filter(field => field.requirable).map(field => field.key));
  return new Set((Array.isArray(list) ? list : []).filter(key => allowed.has(key) && !hidden.has(key)));
}

export function toggleRequired(setting, form, key) {
  const current = setting === undefined || setting === null ? { ...DEFAULT_REQUIRED } : parse(setting);
  const list = new Set(Array.isArray(current[form]) ? current[form] : []);
  if (list.has(key)) list.delete(key);
  else if ((FORM_FIELDS[form] || []).some(field => field.key === key && field.requirable)) list.add(key);
  return { ...current, [form]: [...list] };
}
