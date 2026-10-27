const { providerFetch } = require('../../utils/integrationHttp');
// SMS adapters.
//
// Each adapter exports:
//   • label         — human-readable name
//   • description   — what it does
//   • fields        — credential fields (encrypted)
//   • config_fields — non-secret config fields (e.g. sender id)
//   • send({ to, message }) → Promise<{ provider_id }>  or throws

async function twilioSend({ credentials, config, to, message }) {
  const accountSid = credentials.account_sid;
  const authToken  = credentials.auth_token;
  const from       = credentials.from || config?.from;
  if (!accountSid || !authToken || !from) throw new Error('missing twilio credentials');

  const body = new URLSearchParams({ To: to, From: from, Body: message }).toString();
  const r = await providerFetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
    },
    body,
  });
  if (!r.ok) throw new Error(`twilio:${r.status}`);
  const data = await r.json();
  return { provider_id: data.sid };
}

async function unifonicSend({ credentials, config, to, message }) {
  // Unifonic — popular Saudi SMS gateway. REST: /messages/v1/send
  const appsid = credentials.app_sid;
  const sender = credentials.sender_name || config?.sender_name || 'AyKhidma';
  if (!appsid) throw new Error('missing unifonic app_sid');

  const params = new URLSearchParams({ AppSid: appsid, Recipient: to, Body: message, SenderID: sender });
  const r = await providerFetch('https://el.cloud.unifonic.com/rest/SMS/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!r.ok) throw new Error(`unifonic:${r.status}`);
  const data = await r.json();
  if (!data || data.success === 'false') throw new Error('unifonic: failed');
  return { provider_id: data?.data?.MessageID };
}

// Saudi gateways (AYK-016). The API URL is editable from the admin panel in
// case the provider changes its path, but only the listed HTTPS hosts are
// accepted, so a stored secret can never be sent anywhere else. The owner's
// working setup posts the Taqnyat format with a Bearer token to 4jawaly's URL.
const TAQNYAT_HOSTS = ['api.taqnyat.sa', 'api-sms.4jawaly.com'];
const JAWALY_HOSTS = ['api-sms.4jawaly.com'];
const TAQNYAT_URL = 'https://api.taqnyat.sa/v1/messages';
const JAWALY_URL = 'https://api-sms.4jawaly.com/api/v1/account/area/sms/send';

function smsGatewayUrl(value, fallback, hosts) {
  let url;
  try { url = new URL(String(value || fallback).trim()); } catch (_) { throw new Error('invalid sms api url'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
      || !hosts.includes(url.hostname.toLowerCase())) throw new Error('sms api url must use the provider https host');
  return url.toString();
}

// Saudi numbers are sent as 9665XXXXXXXX (no plus sign).
function saudiNumber(value) {
  let digits = String(value || '').replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = '966' + digits.slice(1);
  else if (/^5\d{8}$/.test(digits)) digits = '966' + digits;
  if (!/^\d{8,15}$/.test(digits)) throw new Error('invalid phone number');
  return digits;
}

async function taqnyatSend({ credentials, config, to, message }) {
  const token = credentials.token;
  const sender = credentials.sender || config?.sender;
  if (!token || !sender) throw new Error('missing taqnyat credentials');
  const r = await providerFetch(smsGatewayUrl(credentials.api_url || config?.api_url, TAQNYAT_URL, TAQNYAT_HOSTS), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipients: [saudiNumber(to)], body: message, sender }),
  });
  if (!r.ok) throw new Error(`taqnyat:${r.status}`);
  const data = await r.json().catch(() => ({}));
  return { provider_id: data?.messageId ? String(data.messageId) : null };
}

async function jawalySend({ credentials, config, to, message }) {
  const key = credentials.app_key, secret = credentials.app_secret;
  const sender = credentials.sender || config?.sender;
  if (!key || !secret || !sender) throw new Error('missing 4jawaly credentials');
  const r = await providerFetch(smsGatewayUrl(credentials.api_url || config?.api_url, JAWALY_URL, JAWALY_HOSTS), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64') },
    body: JSON.stringify({ messages: [{ text: message, numbers: [saudiNumber(to)], sender }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data.code !== undefined && Number(data.code) !== 200)) throw new Error(`4jawaly:${r.status}`);
  return { provider_id: data?.job_id ? String(data.job_id) : null };
}

async function consoleSend({ to, message }) {
  // Default for demo / dev: print the message to the server log.
  if (process.env.NODE_ENV === 'production') throw new Error('Development adapter disabled');
  return { provider_id: `dev-${Date.now()}` };
}

module.exports = {
  twilio: {
    label: 'Twilio',
    description: 'twilio.com SMS API',
    fields: [
      { key: 'account_sid', label: 'Account SID', required: true },
      { key: 'auth_token',  label: 'Auth Token',  required: true, sensitive: true },
      { key: 'from',        label: 'From number', required: true },
    ],
    config_fields: [],
    send: twilioSend,
  },
  unifonic: {
    label: 'Unifonic',
    description: 'Saudi SMS gateway (oneapi.unifonic.com)',
    fields: [
      { key: 'app_sid',      label: 'App SID',     required: true, sensitive: true },
      { key: 'sender_name',  label: 'Sender name', required: false },
    ],
    config_fields: [
      { key: 'sender_name',  label: 'Sender name fallback' },
    ],
    send: unifonicSend,
  },
  taqnyat: {
    label: 'Taqnyat SMS (Bearer token)',
    description: 'Saudi SMS gateway using a Bearer token (api.taqnyat.sa or api-sms.4jawaly.com)',
    fields: [
      { key: 'api_url', label: 'API URL', required: false },
      { key: 'token',   label: 'Bearer token', required: true, sensitive: true },
      { key: 'sender',  label: 'Sender name', required: true },
    ],
    config_fields: [],
    validate: data => smsGatewayUrl(data.credentials?.api_url || data.config?.api_url, TAQNYAT_URL, TAQNYAT_HOSTS),
    send: taqnyatSend,
  },
  '4jawaly': {
    label: '4jawaly SMS',
    description: 'Saudi SMS gateway (api-sms.4jawaly.com) using an app key and secret',
    fields: [
      { key: 'api_url',    label: 'API URL', required: false },
      { key: 'app_key',    label: 'App key', required: true },
      { key: 'app_secret', label: 'App secret', required: true, sensitive: true },
      { key: 'sender',     label: 'Sender name', required: true },
    ],
    config_fields: [],
    validate: data => smsGatewayUrl(data.credentials?.api_url || data.config?.api_url, JAWALY_URL, JAWALY_HOSTS),
    send: jawalySend,
  },
  console: {
    label: 'Console (dev only)',
    description: 'Logs the SMS to the server console — never use in production',
    fields: [],
    config_fields: [],
    send: consoleSend,
  },
};
