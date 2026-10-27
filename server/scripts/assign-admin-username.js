#!/usr/bin/env node
// Dry-run by default. Requires an explicit existing account ID; it never
// creates administrators, resets passwords or revokes existing sessions.
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { buildAdminUsernameQueries, assignAdminUsername } = require('../services/adminUsernameService');

function argumentsFor(args) {
  const options = { apply: false };
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === '--apply') options.apply = true;
    else if (['--admin-id', '--username', '--transport'].includes(flag) && args[index + 1]) {
      options[{ '--admin-id': 'adminId', '--username': 'username', '--transport': 'transport' }[flag]] = args[++index];
    } else throw new Error('Usage: node server/scripts/assign-admin-username.js --admin-id ID --username NAME [--apply] [--transport postgres|neon-http]');
  }
  buildAdminUsernameQueries(options); // Validate inputs before opening a connection.
  if (options.transport && !['postgres', 'neon-http'].includes(options.transport)) throw new Error('Unsupported database transport.');
  return options;
}

function configuration() {
  let file = {};
  if (process.env.NODE_ENV !== 'test') {
    const root = path.resolve(__dirname, '../..');
    const source = ['.env.local', '.env'].map(name => path.join(root, name)).find(name => fs.existsSync(name));
    if (source) file = require('dotenv').parse(fs.readFileSync(source));
  }
  return { ...file, ...process.env };
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  const config = configuration();
  const connectionString = config.DIRECT_DATABASE_URL || config.DATABASE_URL;
  let result;
  if (options.transport === 'neon-http') {
    if (!connectionString) throw new Error('Database configuration is required.');
    const url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) throw new Error('The HTTP transport requires a Neon database.');
    const response = await fetch(`https://${url.hostname}/sql`, {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: {
        'Content-Type': 'application/json', 'Neon-Connection-String': connectionString,
        'Neon-Raw-Text-Output': 'false', 'Neon-Array-Mode': 'false',
        'Neon-Batch-Isolation-Level': 'ReadCommitted',
      },
      body: JSON.stringify({ queries: buildAdminUsernameQueries(options) }),
    });
    if (!response.ok) throw new Error('Database operation failed.');
    const payload = await response.json();
    const batch = Array.isArray(payload) ? payload : payload.results;
    if (!Array.isArray(batch)) throw new Error('Unexpected database response.');
    result = batch.at(-1)?.rows?.[0];
  } else {
    const client = new Client(connectionString ? { connectionString, connectionTimeoutMillis: 15000 } : {
      host: config.DB_HOST || '127.0.0.1', port: Number(config.DB_PORT || 5432),
      database: config.DB_NAME, user: config.DB_USER, password: config.DB_PASSWORD,
      ssl: false, connectionTimeoutMillis: 15000,
    });
    await client.connect();
    try { result = await assignAdminUsername(client, options); }
    finally { await client.end(); }
  }
  if (!result || !['ready', 'assigned', 'unchanged'].includes(result.status)) {
    console.error(JSON.stringify({ status: result?.status || 'not_assigned', admin_id: Number(options.adminId) }));
    process.exitCode = 1;
    return;
  }
  // No password, token, connection string or other account data is logged.
  console.log(JSON.stringify(result));
}

if (require.main === module) main().catch(() => {
  console.error('Administrator username assignment failed; no credential details were logged.');
  process.exitCode = 1;
});
module.exports = { argumentsFor, configuration };
