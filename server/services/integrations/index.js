// Central registry of integration adapters.
//
// An adapter is a tiny object that knows how to talk to one external
// provider (Twilio, Meta WhatsApp Cloud, SendGrid, …). Adapters are
// loaded once and looked up by `provider` string. The verification
// service and other consumers ask the registry for an adapter; the
// registry never touches the DB itself — that's ApiIntegration's job.

const smsAdapters       = require('./sms');
const whatsappAdapters  = require('./whatsapp');
const emailAdapters     = require('./email');
const nafathAdapters    = require('./nafath');
const { allowedGatewayUrl } = require('../../utils/integrationHttp');

const REGISTRY = {
  sms:      smsAdapters,
  whatsapp: whatsappAdapters,
  email:    emailAdapters,
  nafath:   nafathAdapters,
};

// Built-in last-resort adapters so the platform stays functional in
// demo / sandbox deployments without any provider configured.
function getAdapter(type, providerName) {
  if (process.env.NODE_ENV === 'production' && ['console', 'mock'].includes(providerName)) return null;
  const group = Object.prototype.hasOwnProperty.call(REGISTRY, type) ? REGISTRY[type] : null;
  if (!group) return null;
  return Object.prototype.hasOwnProperty.call(group, providerName) ? group[providerName] : null;
}

function validateIntegration(type, provider, data = {}) {
  const adapter = getAdapter(type, provider);
  if (!adapter) throw Object.assign(new Error('Invalid integration provider'), { status: 400 });
  if (type === 'nafath' && provider === 'nafath_api') {
    try { allowedGatewayUrl(data.credentials?.base_url || data.config?.base_url); }
    catch (_) { throw Object.assign(new Error('Integration URL must use an allowed HTTPS host'), { status: 400 }); }
  }
  if (typeof adapter.validate === 'function') {
    try { adapter.validate(data); }
    catch (_) { throw Object.assign(new Error('Integration URL must use the provider HTTPS host'), { status: 400 }); }
  }
  return true;
}

function listAdapters(type) {
  const group = Object.prototype.hasOwnProperty.call(REGISTRY, type) ? REGISTRY[type] : {};
  return Object.entries(group).filter(([provider]) => getAdapter(type, provider)).map(([provider, a]) => ({
    provider,
    label: a.label || provider,
    fields: a.fields || [],
    config_fields: a.config_fields || [],
    description: a.description || null,
  }));
}

function listAllTypes() {
  return Object.keys(REGISTRY);
}

// Resolve the active adapter for a type. Returns { adapter, integration }
// where integration may be null (in which case the noop fallback is used).
async function resolveActive(type) {
  const ApiIntegration = require('../../models/ApiIntegration');
  const integration = await ApiIntegration.findActive(type);
  if (integration) {
    const adapter = getAdapter(type, integration.provider);
    if (adapter) return { adapter, integration };
  }
  return { adapter: null, integration: null };
}

module.exports = { REGISTRY, getAdapter, validateIntegration, listAdapters, listAllTypes, resolveActive };
