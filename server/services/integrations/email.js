const { providerFetch } = require('../../utils/integrationHttp');
// Email adapters — SendGrid + Resend + console fallback. SMTP is left
// as a future plug-in (would require nodemailer dependency).

async function sendgridSend({ credentials, config, to, subject, html, text }) {
  const apiKey = credentials.api_key;
  const from   = credentials.from || config?.from;
  const fromName = config?.from_name || 'AY KHIDMA';
  if (!apiKey || !from) throw new Error('missing sendgrid credentials');

  const r = await providerFetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: fromName },
      subject,
      content: [
        { type: 'text/plain', value: text || subject },
        { type: 'text/html',  value: html || `<p>${text || subject}</p>` },
      ],
    }),
  });
  if (!r.ok) throw new Error(`sendgrid:${r.status}`);
  return { provider_id: r.headers.get('x-message-id') };
}

async function resendSend({ credentials, config, to, subject, html, text }) {
  const apiKey = credentials.api_key;
  const from   = credentials.from || config?.from;
  if (!apiKey || !from) throw new Error('missing resend credentials');

  const r = await providerFetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from, to, subject,
      html: html || `<p>${text || subject}</p>`,
      text: text || subject,
    }),
  });
  if (!r.ok) throw new Error(`resend:${r.status}`);
  const data = await r.json();
  return { provider_id: data?.id };
}

async function consoleSend({ to, subject, text, html }) {
  if (process.env.NODE_ENV === 'production') throw new Error('Development adapter disabled');
  return { provider_id: `dev-${Date.now()}` };
}

module.exports = {
  sendgrid: {
    label: 'SendGrid',
    description: 'sendgrid.com transactional email',
    fields: [
      { key: 'api_key', label: 'API Key', required: true, sensitive: true },
      { key: 'from',    label: 'From email', required: true },
    ],
    config_fields: [
      { key: 'from_name', label: 'From name' },
    ],
    send: sendgridSend,
  },
  resend: {
    label: 'Resend',
    description: 'resend.com transactional email',
    fields: [
      { key: 'api_key', label: 'API Key', required: true, sensitive: true },
      { key: 'from',    label: 'From email', required: true },
    ],
    config_fields: [],
    send: resendSend,
  },
  console: {
    label: 'Console (dev only)',
    description: 'Prints to server console',
    fields: [],
    config_fields: [],
    send: consoleSend,
  },
};
