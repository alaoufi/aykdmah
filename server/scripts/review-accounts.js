#!/usr/bin/env node
// The two accounts App Review signs in with (AYK-201): a service requester and a service provider,
// each with sample data (a request between them, the provider's reply and a conversation), so the
// reviewer can try both roles at once. The password is typed on the server, never put in a file,
// a message or the repository; the same one is then entered in App Store Connect.
// Run again any time: it updates the password and keeps the existing sample data.
// Usage on the server: docker exec -it aykdmh-app node server/scripts/review-accounts.js
const readline = require('node:readline');

const ACCOUNTS = [
  { username: 'apple_review_client', role: 'client', full_name: 'Apple Review (Requester)', email: 'review-client@aykdmh.com' },
  { username: 'apple_review_provider', role: 'provider', full_name: 'Apple Review (Provider)', email: 'review-provider@aykdmh.com' },
];

function askHidden(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (!rl.stdoutMuted) rl.output.write(text); };
    rl.question(question, answer => { rl.close(); process.stdout.write('\n'); resolve(answer); });
    rl.stdoutMuted = true;
  });
}

// Creates or refreshes both accounts and their sample data; returns what it made (tested in
// server/tests/security-auth.integration.js).
async function prepareReviewAccounts(password) {
  const db = require('../config/database');
  const { hashPassword } = require('../utils/hash');
  const Conversation = require('../models/Conversation');
  const Message = require('../models/Message');
  if (typeof password !== 'string' || Array.from(password).length < 8) throw new Error('Use at least 8 characters.');
  const hash = await hashPassword(password);
  {

    // A real place and trade, so maps, areas and matching show something meaningful.
    const area = await db.queryOne(`SELECT d.id AS district_id, d.city_id, c.governorate_id, g.region_id, r.country_id
      FROM districts d JOIN cities c ON c.id = d.city_id LEFT JOIN governorates g ON g.id = c.governorate_id
      LEFT JOIN regions r ON r.id = COALESCE(c.region_id, g.region_id) ORDER BY d.id LIMIT 1`);
    const trade = await db.queryOne(`SELECT s.id, s.category_id FROM services s JOIN categories k ON k.id = s.category_id
      WHERE s.is_active = 1 ORDER BY (k.slug = 'electrical') DESC, s.id LIMIT 1`);
    if (!area || !trade) throw new Error('No district or service found for the sample data.');

    const ids = {};
    for (const account of ACCOUNTS) {
      const existing = await db.queryOne('SELECT id FROM users WHERE username = ?', [account.username]);
      let id = existing?.id;
      if (id) {
        await db.query(`UPDATE users SET password_hash = ?, role = ?, is_active = 1, is_blocked = 0, deleted_at = NULL,
          auth_version = auth_version + 1 WHERE id = ?`, [hash, account.role, id]);
      } else {
        id = (await db.query(`INSERT INTO users (full_name, username, email, password_hash, role, is_active, is_verified,
            email_verified_at, country_id, region_id, governorate_id, city_id, district_id)
          VALUES (?, ?, ?, ?, ?, 1, 1, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
        [account.full_name, account.username, account.email, hash, account.role,
          area.country_id, area.region_id, area.governorate_id, area.city_id, area.district_id])).insertId;
      }
      // Verified by email on our own domain, so any "verify first" policy lets the reviewer act.
      await db.query(`INSERT INTO user_verifications (user_id, method, status, identifier, verified_at)
        VALUES (?, 'email', 'verified', ?, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, method) DO UPDATE SET status = 'verified', identifier = EXCLUDED.identifier, verified_at = CURRENT_TIMESTAMP`,
      [id, account.email]);
      ids[account.role] = id;
    }

    // The provider covers the area but is paused, so real requesters are never matched with it.
    await db.query(`INSERT INTO provider_profiles (user_id, service_ids, availability_status) VALUES (?, ?, 'paused')
      ON CONFLICT (user_id) DO UPDATE SET availability_status = 'paused'`, [ids.provider, JSON.stringify([trade.id])]);
    await db.query(`INSERT INTO provider_coverage_districts (user_id, district_id) VALUES (?, ?)
      ON CONFLICT DO NOTHING`, [ids.provider, area.district_id]).catch(() => {});

    // One request between the two, already assigned (so real providers never see it), with a chat.
    let request = await db.queryOne('SELECT id FROM requests WHERE client_id = ? ORDER BY id LIMIT 1', [ids.client]);
    if (!request) {
      request = { id: (await db.query(`INSERT INTO requests (client_id, title, description, category_id, service_id,
          city_id, district_id, assigned_provider_id, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned')`,
      [ids.client, 'Sample request: electrical repair', 'Demo request for App Review. Please use the chat and the call buttons.',
        trade.category_id, trade.id, area.city_id, area.district_id, ids.provider])).insertId };
    }
    const conversation = await Conversation.findOrCreateBetween(ids.client, ids.provider, request.id);
    const said = await db.queryOne('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?', [conversation]);
    if (!Number(said?.n)) {
      await Message.create({ conversation_id: conversation, sender_id: ids.client, content: 'Hello, can you fix the kitchen light today?' });
      await Message.create({ conversation_id: conversation, sender_id: ids.provider, content: 'Yes, I can come at 5 pm.' });
    }
    return { ...ids, request: request.id, conversation };
  }
}

async function main() {
  const db = require('../config/database');
  try {
    const password = await askHidden('Password for both review accounts (8+ characters): ');
    if (await askHidden('Type it again: ') !== password) throw new Error('The two entries differ.');
    const made = await prepareReviewAccounts(password);
    console.log(`Ready: ${ACCOUNTS.map(a => a.username).join(' and ')} (request ${made.request}, conversation ${made.conversation}).`);
    console.log('Enter the same username and password in App Store Connect → App Review Information.');
  } finally {
    await db.getPool().end().catch(() => {});
  }
}

module.exports = { prepareReviewAccounts, ACCOUNTS };
if (require.main === module) main().catch(err => { console.error(err.message); process.exit(1); });
