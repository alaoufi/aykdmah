// Trusted maintenance only. Public registration and admin mutation permissions
// remain in their existing controllers/models; this is not an HTTP endpoint.
function buildAdminUsernameQueries({ adminId, username, apply = false }) {
  const id = Number(adminId);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) throw new Error('An explicit positive administrator ID is required.');
  const name = typeof username === 'string' ? username.trim() : '';
  // Avoid usernames that can be interpreted as another email/phone identity.
  if (!/^[A-Za-z][A-Za-z0-9_]{2,59}$/.test(name)) throw new Error('Use a username of 3–60 letters, digits or underscores, starting with a letter.');
  if (typeof apply !== 'boolean') throw new Error('The apply option must be a boolean.');
  const changed = apply ? `
    UPDATE users u SET username = $2
    FROM target t
    WHERE u.id = t.id AND NULLIF(BTRIM(t.username), '') IS NULL
      AND NOT EXISTS (SELECT 1 FROM conflicts)
    RETURNING u.id` : 'SELECT NULL::integer AS id WHERE FALSE';
  return [
    // Keep the same lock order as administrator/identity changes. Separate
    // statements give the following ReadCommitted lookup a fresh snapshot.
    { query: 'SELECT pg_advisory_xact_lock(731026001)', params: [] },
    { query: 'SELECT pg_advisory_xact_lock(731026002)', params: [] },
    { query: `WITH target AS MATERIALIZED (
       SELECT id, username FROM users
       WHERE id = $1 AND role = 'admin' AND is_active = 1 AND is_blocked = 0 AND deleted_at IS NULL
       FOR UPDATE
     ), conflicts AS MATERIALIZED (
       SELECT id FROM users WHERE id <> $1 AND
         (LOWER(username) = LOWER($2) OR LOWER(email) = LOWER($2)
          OR LOWER(facebook_id) = LOWER($2)
          OR REGEXP_REPLACE(phone, '[[:space:]()-]', '', 'g') = $2)
     ), changed AS (${changed})
     SELECT $1::integer AS admin_id, $2::text AS username,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM target) THEN 'invalid_admin'
         WHEN EXISTS (SELECT 1 FROM target WHERE NULLIF(BTRIM(username), '') IS NOT NULL AND username <> $2) THEN 'existing_username'
         WHEN EXISTS (SELECT 1 FROM conflicts) THEN 'identifier_conflict'
         WHEN EXISTS (SELECT 1 FROM target WHERE username = $2) THEN 'unchanged'
         WHEN $3::boolean THEN 'ready'
         WHEN EXISTS (SELECT 1 FROM changed) THEN 'assigned'
         ELSE 'not_assigned'
       END AS status`, params: [id, name, !apply] },
  ];
}

async function assignAdminUsername(client, options) {
  const queries = buildAdminUsernameQueries(options);
  await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  try {
    let result;
    for (const statement of queries) result = await client.query(statement.query, statement.params);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

module.exports = { buildAdminUsernameQueries, assignAdminUsername };
