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
  const sender = credentials.sender_name || config?.sender_name || 'AWTAD';
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
  console: {
    label: 'Console (dev only)',
    description: 'Logs the SMS to the server console — never use in production',
    fields: [],
    config_fields: [],
    send: consoleSend,
  },
};
