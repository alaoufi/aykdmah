const { providerFetch } = require('../../utils/integrationHttp');
// WhatsApp adapters — Meta Cloud API + console fallback.

async function metaCloudSend({ credentials, config, to, message, templateName, templateLang }) {
  const phoneId = credentials.phone_number_id || config?.phone_number_id;
  const token   = credentials.access_token;
  if (!phoneId || !token) throw new Error('missing whatsapp credentials');

  const body = templateName
    ? {
        messaging_product: 'whatsapp', to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang || 'ar' },
          components: [{ type: 'body', parameters: [{ type: 'text', text: message }] }],
        },
      }
    : {
        messaging_product: 'whatsapp', to,
        type: 'text', text: { body: message },
      };

  const r = await providerFetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(phoneId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`whatsapp:${r.status}`);
  const data = await r.json();
  return { provider_id: data?.messages?.[0]?.id };
}

async function consoleSend({ to, message }) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development adapter disabled');
  return { provider_id: `dev-${Date.now()}` };
}

module.exports = {
  meta_cloud: {
    label: 'WhatsApp Cloud API (Meta)',
    description: 'Official WhatsApp Business Cloud API via Meta Graph',
    fields: [
      { key: 'phone_number_id', label: 'Phone Number ID', required: true },
      { key: 'access_token',    label: 'Access Token',    required: true, sensitive: true },
    ],
    config_fields: [
      { key: 'template_name', label: 'OTP template name (optional)' },
      { key: 'template_lang', label: 'Template language (ar/en/…)' },
    ],
    send: metaCloudSend,
  },
  console: {
    label: 'Console (dev only)',
    description: 'Prints to server console',
    fields: [],
    config_fields: [],
    send: consoleSend,
  },
};
