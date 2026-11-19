const ApiIntegration = require('../models/ApiIntegration');
const integrations = require('../services/integrations');
const { success, created, error, notFound, forbidden, paginate } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');

function validatedData(body, existing = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('Invalid integration', 400);
  const type = body.type ?? existing.type, provider = body.provider ?? existing.provider;
  const adapter = integrations.getAdapter(type, provider);
  if (!adapter) throw new ApiError('Invalid integration provider', 400);
  const cleanObject = (value, fields) => {
    if (value == null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError('Invalid integration fields', 400);
    const allowed = new Set(fields.map(field => field.key));
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (!allowed.has(key) || typeof item !== 'string' || item.length > 4096 || /[\r\n\0]/.test(item)) throw new ApiError('Invalid integration field', 400);
      if (item.trim()) out[key] = item.trim();
    }
    return out;
  };
  const switching = type !== existing.type || provider !== existing.provider;
  const credentials = { ...(switching ? {} : existing.credentials || {}), ...cleanObject(body.credentials, adapter.fields || []) };
  const config = body.config === undefined && !switching ? existing.config || {} : cleanObject(body.config, adapter.config_fields || []);
  const data = { ...body, type, provider, credentials, config };
  if (data.mode !== undefined && !['live', 'sandbox'].includes(data.mode)) throw new ApiError('Invalid integration mode', 400);
  if (data.label !== undefined && (typeof data.label !== 'string' || data.label.length > 100)) throw new ApiError('Invalid integration label', 400);
  for (const field of ['is_enabled', 'is_primary']) {
    if (data[field] !== undefined) {
      if (![true, false, 0, 1].includes(data[field])) throw new ApiError('Invalid integration flag', 400);
      data[field] = data[field] ? 1 : 0;
    }
  }
  if (data.rate_limit_per_min != null && (!Number.isSafeInteger(Number(data.rate_limit_per_min)) || Number(data.rate_limit_per_min) < 1 || Number(data.rate_limit_per_min) > 10000)) throw new ApiError('Invalid integration limit', 400);
  integrations.validateIntegration(type, provider, data);
  return data;
}

// The edit form shows saved non-secret fields (API URL, sender name) as they
// are, and only which secret fields are already stored.
async function withSavedFields(row) {
  if (!row) return row;
  const adapter = integrations.getAdapter(row.type, row.provider);
  const full = await ApiIntegration.findById(row.id, { includeSecrets: true });
  const credentials = full?.credentials || {};
  const fields = adapter?.fields || [];
  row.credentials_public = Object.fromEntries(fields.filter(field => !field.sensitive && credentials[field.key])
    .map(field => [field.key, String(credentials[field.key])]));
  row.credentials_set = fields.filter(field => credentials[field.key]).map(field => field.key);
  return row;
}

const list = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const items = await ApiIntegration.list({ type });
  return success(res, await Promise.all(items.map(withSavedFields)));
});

const get = asyncHandler(async (req, res) => {
  const row = await ApiIntegration.findById(req.params.id);
  if (!row) return notFound(res);
  return success(res, await withSavedFields(row));
});

const create = asyncHandler(async (req, res) => {
  const row = await ApiIntegration.create({ ...validatedData(req.body), created_by: req.user.id });
  return created(res, row);
});

const update = asyncHandler(async (req, res) => {
  const existing = await ApiIntegration.findById(req.params.id, { includeSecrets: true });
  if (!existing) return notFound(res);
  const row = await ApiIntegration.update(req.params.id, validatedData(req.body, existing));
  if (!row) return notFound(res);
  return success(res, row, req.t('updated'));
});

const remove = asyncHandler(async (req, res) => {
  await ApiIntegration.remove(req.params.id);
  return success(res, null, req.t('deleted'));
});

// POST /admin/integrations/:id/test
// Sends a minimal test request through the adapter and persists the result.
const test = asyncHandler(async (req, res) => {
  const integration = await ApiIntegration.findById(req.params.id, { includeSecrets: true });
  if (!integration) return notFound(res);
  integrations.validateIntegration(integration.type, integration.provider, integration);
  const adapter = integrations.getAdapter(integration.type, integration.provider);
  if (!adapter) return error(res, 'no adapter');

  const started = Date.now();
  try {
    if (integration.type === 'sms' || integration.type === 'whatsapp') {
      const to = req.body.to || req.user.phone;
      if (!to) return error(res, req.t('invalid_data'));
      await adapter.send({
        credentials: integration.credentials || {},
        config: integration.config || {},
        to, message: req.body.message || 'AY KHIDMA test message',
      });
    } else if (integration.type === 'email') {
      const to = req.body.to || req.user.email;
      await adapter.send({
        credentials: integration.credentials || {},
        config: integration.config || {},
        to, subject: 'AY KHIDMA test', text: 'This is a test message.',
      });
    } else if (integration.type === 'nafath') {
      await adapter.start({
        credentials: integration.credentials || {},
        config: integration.config || {},
        nationalId: req.body.national_id || '1000000000',
      });
    } else {
      return error(res, 'test not implemented for type ' + integration.type);
    }
    await ApiIntegration.recordTestResult(integration.id, true, 'ok');
    await ApiIntegration.logUsage({
      integration_id: integration.id, type: integration.type, provider: integration.provider,
      user_id: req.user.id, action: 'test', status: 'ok', latency_ms: Date.now() - started,
    });
    return success(res, { ok: true });
  } catch (err) {
    // Adapter errors carry the provider name and status, never a credential.
    console.warn('[integration test failed]', integration.type, integration.provider,
      err.message, err.providerMessage || '', err.cause?.code || '');
    await ApiIntegration.recordTestResult(integration.id, false, 'Provider request failed');
    await ApiIntegration.logUsage({
      integration_id: integration.id, type: integration.type, provider: integration.provider,
      user_id: req.user.id, action: 'test', status: 'error',
      error_message: 'Provider request failed', latency_ms: Date.now() - started,
    });
    // Administrators see the provider's own reason (adapters strip secrets from it).
    return error(res, err.providerMessage ? `Provider: ${err.providerMessage}` : 'Provider request failed', 502);
  }
});

// GET /admin/integrations/providers — adapter catalog (for UI dropdowns)
const providers = asyncHandler(async (req, res) => {
  const out = {};
  for (const t of integrations.listAllTypes()) out[t] = integrations.listAdapters(t);
  return success(res, out);
});

// GET /admin/integrations/usage
const usage = asyncHandler(async (req, res) => {
  const { type, status, page = 1, limit = 50 } = req.query;
  const { items, total } = await ApiIntegration.listUsage({ type, status, page, limit });
  return paginate(res, items, total, page, limit);
});

module.exports = { list, get, create, update, remove, test, providers, usage };
