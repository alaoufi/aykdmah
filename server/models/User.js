const { query, queryOne, transaction, tableHasColumn } = require('../config/database');
const { hasPermission, canManageAdmin } = require('../middleware/roleCheck');
const { sanitizePermissions } = require('../config/permissions');
const { ApiError } = require('../middleware/errorHandler');
const ProviderBadge = require('./ProviderBadge');
const Subscription = require('./Subscription');
const { accountAddress } = require('../utils/userLocation');

const SELECT_FIELDS = `
  u.id, u.full_name, u.username, u.email, u.phone, u.facebook_id, u.role, u.avatar,
  u.is_active, u.is_blocked, u.is_verified, u.is_online,
  u.city_id, u.district_id, u.latitude, u.longitude,
  u.last_seen_at, u.created_at, u.must_change_password
`;

// Hydrate admin-only fields (is_super_admin, permissions) when they
// exist on the schema. Returning them makes the JWT auth middleware
// able to enforce per-section access without an extra query.
function hydrateAdmin(row) {
  if (!row) return row;
  if (typeof row.permissions === 'string') {
    try { row.permissions = JSON.parse(row.permissions); } catch (_) { row.permissions = []; }
  }
  if (!Array.isArray(row.permissions)) row.permissions = [];
  row.is_super_admin = row.is_super_admin === 1 || row.is_super_admin === true ? 1 : 0;
  return row;
}

async function findById(id) {
  const [hasAdminCols, hasCountry, hasRegion, hasGov, hasCityRegion, hasRegionCountry, hasCountries, hasAlsoClient] = await Promise.all([
    tableHasColumn('users', 'is_super_admin'), tableHasColumn('users', 'country_id'),
    tableHasColumn('users', 'region_id'), tableHasColumn('users', 'governorate_id'),
    tableHasColumn('cities', 'region_id'), tableHasColumn('regions', 'country_id'),
    tableHasColumn('countries', 'id'), tableHasColumn('users', 'also_client'),
  ]);
  const extra = (hasAdminCols ? ', u.is_super_admin, u.permissions' : '') + (hasAlsoClient ? ', u.also_client' : '');
  const govId = hasGov ? 'COALESCE(u.governorate_id, c.governorate_id)' : 'c.governorate_id';
  const regionPaths = [hasRegion && 'u.region_id', hasCityRegion && 'c.region_id', 'g.region_id'].filter(Boolean);
  const regionId = regionPaths.length > 1 ? `COALESCE(${regionPaths.join(', ')})` : regionPaths[0];
  const countryPaths = [hasCountry && 'u.country_id', hasRegionCountry && 'r.country_id'].filter(Boolean);
  const countryId = countryPaths.length > 1 ? `COALESCE(${countryPaths.join(', ')})` : countryPaths[0] || 'NULL';
  const names = (alias, label) => `${alias}.name_ar AS ${label}_name, ${alias}.name_ar AS ${label}_name_ar, ${alias}.name_en AS ${label}_name_en`;
  const row = await queryOne(
    `SELECT ${SELECT_FIELDS}${extra}, up.address,
            ${countryId} AS country_id, ${regionId} AS region_id, ${govId} AS governorate_id,
            ${names('c', 'city')}, ${names('d', 'district')}, ${names('g', 'governorate')}, ${names('r', 'region')}
            ${hasCountries ? `, ${names('co', 'country')}` : ', NULL AS country_name, NULL AS country_name_ar, NULL AS country_name_en'}
     FROM users u
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN cities c ON u.city_id = c.id
     LEFT JOIN districts d ON u.district_id = d.id
     LEFT JOIN governorates g ON g.id = ${govId}
     LEFT JOIN regions r ON r.id = ${regionId}
     ${hasCountries ? `LEFT JOIN countries co ON co.id = ${countryId}` : ''}
     WHERE u.id = ? AND u.deleted_at IS NULL`,
    [id]
  );
  return hydrateAdmin(row);
}

async function findByEmail(email) {
  const exact = await queryOne(
    'SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
    [email]
  );
  if (exact) return exact;
  const matches = await query('SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND deleted_at IS NULL LIMIT 2', [email]);
  return matches.length === 1 ? matches[0] : null;
}

async function findByPhone(phone) {
  const exact = await queryOne(
    'SELECT * FROM users WHERE phone = ? AND deleted_at IS NULL LIMIT 1',
    [phone]
  );
  if (exact) return exact;
  const matches = await query("SELECT * FROM users WHERE REGEXP_REPLACE(phone, '[[:space:]()-]', '', 'g') = ? AND deleted_at IS NULL LIMIT 2", [String(phone).replace(/[\s()-]/g, '')]);
  return matches.length === 1 ? matches[0] : null;
}

async function findByIdRaw(id) {
  // Like findById but returns every column (incl. password_hash). Used
  // by change-password / login refreshes.
  return queryOne('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1', [id]);
}

async function findByUsername(username) {
  return queryOne(
    'SELECT * FROM users WHERE username = ? AND deleted_at IS NULL LIMIT 1',
    [username]
  );
}

async function findByFacebookId(facebookId) {
  return queryOne(
    'SELECT * FROM users WHERE facebook_id = ? AND deleted_at IS NULL LIMIT 1',
    [facebookId]
  );
}

// Universal lookup: tries every identifier the user might have signed
// up with. Used by /auth/login so the form can accept any of them in a
// single field.
async function findByIdentifier(identifier) {
  if (typeof identifier !== 'string') return null;
  const v = String(identifier).trim();
  if (!v) return null;
  const phone = /^[\d+\s\-()]+$/.test(v) ? v.replace(/[\s\-()]/g, '') : null;
  const rows = await query(`SELECT * FROM users WHERE deleted_at IS NULL AND
    (username = ? OR LOWER(email) = LOWER(?) OR facebook_id = ? OR REGEXP_REPLACE(phone, '[[:space:]()-]', '', 'g') = ?) LIMIT 2`, [v, v, v, phone]);
  // Dirty legacy records or cross-field collisions must never choose an
  // arbitrary owner. Existing unique formatted phone/email logins still work.
  return rows.length === 1 ? rows[0] : null;
}

async function checkIdentifierConflicts(conn, data, existing = null) {
  for (const field of ['username', 'email', 'phone', 'facebook_id']) {
    if (data[field] === undefined || data[field] === null || data[field] === '') continue;
    const value = String(data[field]).trim();
    const normalized = field === 'phone' ? value.replace(/[\s()-]/g, '') : field === 'email' ? value.toLowerCase() : value;
    const old = existing && String(existing[field] || '').trim();
    const oldNormalized = field === 'phone' ? old?.replace(/[\s()-]/g, '') : field === 'email' ? old?.toLowerCase() : old;
    if (existing && normalized === oldNormalized) continue;
    const phone = /^[\d+\s\-()]+$/.test(value) ? value.replace(/[\s\-()]/g, '') : null;
    const [rows] = await conn.execute(`SELECT id FROM users WHERE id <> ? AND
      (username = ? OR LOWER(email) = LOWER(?) OR facebook_id = ? OR REGEXP_REPLACE(phone, '[[:space:]()-]', '', 'g') = ?) LIMIT 1`, [existing?.id || 0, value, value, value, phone]);
    if (rows.length) {
      const err = new ApiError('Login identifier is already taken', 409);
      err.code = '23505'; err.constraint = `uq_users_${field}`;
      throw err;
    }
  }
}

async function create({ full_name, username, email, phone, facebook_id, password_hash, role,
                        country_id, region_id, governorate_id, city_id, district_id,
                        latitude, longitude, address, is_active = 1, location_mode = 'mobile', fixed_address = null,
                        fixed_latitude = null, fixed_longitude = null, category_id, service_ids, any_category = false,
                        also_client = false, coverage = null }) {
  let providerServices = {};
  const privateAddress = address === undefined ? undefined : accountAddress(address);
  if (role === 'provider') {
    if (!['fixed', 'mobile', 'both'].includes(location_mode) ||
        (fixed_address !== null && (typeof fixed_address !== 'string' || fixed_address.length > 255))) {
      throw new ApiError('Invalid provider service location', 400);
    }
    if (category_id !== undefined || service_ids !== undefined) {
      providerServices = await require('../utils/providerServices').validateProviderServices(
        any_category ? { service_ids, any_category: true } : { category_id, service_ids }, {}, { required: true });
    }
  }
  // Optional columns (added by later migrations) are skipped if the
  // host hasn't applied them yet — keeps registration working on
  // partially-migrated databases.
  const hasCountry = await tableHasColumn('users', 'country_id');
  const hasRegion  = await tableHasColumn('users', 'region_id');
  const hasGov     = await tableHasColumn('users', 'governorate_id');

  const cols = ['full_name', 'username', 'email', 'phone', 'facebook_id',
                'password_hash', 'role', 'city_id', 'district_id',
                'latitude', 'longitude', 'is_active'];
  const vals = [full_name, username || null, email || null, phone || null, facebook_id || null,
                password_hash, role, city_id || null, district_id || null,
                latitude ?? null, longitude ?? null, is_active === false || is_active === 0 ? 0 : 1];
  if (hasCountry) { cols.push('country_id'); vals.push(country_id || null); }
  if (hasRegion)  { cols.push('region_id'); vals.push(region_id || null); }
  if (hasGov)     { cols.push('governorate_id'); vals.push(governorate_id || null); }
  if (role === 'provider' && also_client) { cols.push('also_client'); vals.push(1); }
  const placeholders = cols.map(() => '?').join(', ');

  return transaction(async (conn) => {
    await conn.execute('SELECT pg_advisory_xact_lock(731026002)');
    await checkIdentifierConflicts(conn, { username, email, phone, facebook_id });
    const [result] = await conn.execute(
      `INSERT INTO users (${cols.join(', ')}) VALUES (${placeholders})`,
      vals
    );
    const userId = result.insertId;

    if (role === 'provider') {
      // Public work details are supplied explicitly; private account GPS is
      // never copied into the provider's work address or coordinates.
      // The service venue point is the one the provider picked for it, never the account point.
      const venue = location_mode !== 'mobile' && fixed_latitude != null && fixed_longitude != null;
      await conn.execute(`INSERT INTO provider_profiles (user_id, location_mode, fixed_address, fixed_latitude, fixed_longitude, category_id, service_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, location_mode, location_mode === 'mobile' ? null : (fixed_address?.trim() || null),
          venue ? fixed_latitude : null, venue ? fixed_longitude : null,
          providerServices.category_id ?? null, providerServices.service_ids ? JSON.stringify(providerServices.service_ids) : null]);
      if (coverage) await require('../utils/providerCoverage').saveCoverage((sql, params) => conn.execute(sql, params), userId, coverage);
    }
    if (role === 'client' || role === 'provider' || privateAddress !== undefined) {
      await conn.execute('INSERT INTO user_profiles (user_id, address) VALUES (?, ?)', [userId, privateAddress ?? null]);
    }
    return userId;
  });
}

async function update(id, data) {
  const privateAddress = data.address === undefined ? undefined : accountAddress(data.address);
  const allowed = ['full_name', 'phone', 'avatar', 'city_id', 'district_id', 'latitude', 'longitude'];
  for (const column of ['country_id', 'region_id', 'governorate_id']) {
    if (await tableHasColumn('users', column)) allowed.push(column);
  }
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(data[k]);
    }
  }
  if (!fields.length && privateAddress === undefined) return findById(id);
  await transaction(async conn => {
    await conn.execute('SELECT pg_advisory_xact_lock(731026002)');
    const [rows] = await conn.execute('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    const current = rows[0];
    if (!current) throw new ApiError('Account not found', 404);
    requireIdentifier({ ...current, phone: data.phone === undefined ? current.phone : data.phone });
    await checkIdentifierConflicts(conn, { phone: data.phone }, current);
    if (fields.length) await conn.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
    if (privateAddress !== undefined) await saveAccountAddress(conn, id, privateAddress);
    await invalidateContactVerification(conn, current, { phone: data.phone });
  });
  return findById(id);
}

function requireIdentifier(user) {
  if (![user.username, user.email, user.phone, user.facebook_id].some(value => typeof value === 'string' && value.trim())) throw new ApiError('At least one login identifier is required', 400);
}

async function invalidateContactVerification(conn, current, data) {
  const changed = ['email', 'phone'].filter(key => data[key] !== undefined && String(data[key] || '') !== String(current[key] || ''));
  if (!changed.length) return;
  const methods = changed.flatMap(key => key === 'email' ? ['email'] : ['sms', 'whatsapp']);
  const placeholders = methods.map(() => '?').join(', ');
  await conn.execute(`DELETE FROM user_verifications WHERE user_id = ? AND method IN (${placeholders})`, [current.id, ...methods]);
  await conn.execute(`UPDATE verification_otps SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND method IN (${placeholders}) AND consumed_at IS NULL`, [current.id, ...methods]);
  await conn.execute(`UPDATE users SET ${changed.map(key => `${key}_verified_at = NULL`).join(', ')},
    is_verified = CASE WHEN EXISTS (SELECT 1 FROM verification_requests vr WHERE vr.user_id = users.id AND vr.status = 'approved')
      OR EXISTS (SELECT 1 FROM user_verifications uv WHERE uv.user_id = users.id AND uv.status = 'verified' AND (uv.expires_at IS NULL OR uv.expires_at > CURRENT_TIMESTAMP)) THEN 1 ELSE 0 END WHERE id = ?`, [current.id]);
}

async function updatePassword(id, password_hash, expectedHash) {
  const result = await query(`UPDATE users SET password_hash = ?, must_change_password = 0, auth_version = auth_version + 1 WHERE id = ?${expectedHash ? ' AND password_hash = ?' : ''}`, [password_hash, id, ...(expectedHash ? [expectedHash] : [])]);
  return result.affectedRows === 1;
}

async function completeLogin(id, expectedHash) {
  return transaction(async conn => {
    const [rows] = await conn.execute('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    const user = rows[0];
    if (!user || user.password_hash !== expectedHash) return null;
    if (user.is_active && !user.is_blocked) await conn.execute('UPDATE users SET is_online = 1, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return user;
  });
}

async function revokeSessions(id) {
  await query('UPDATE users SET auth_version = auth_version + 1 WHERE id = ?', [id]);
}

async function lockedAdminMutation(id, actor, callback) {
  if (!actor) throw new ApiError('Forbidden', 403);
  return transaction(async conn => {
    // Every admin identity/permission mutation shares this lock so concurrent
    // requests cannot disable the last usable super administrator.
    await conn.execute('SELECT pg_advisory_xact_lock(731026001)');
    await conn.execute('SELECT pg_advisory_xact_lock(731026002)');
    const [actors] = await conn.execute('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [actor.id]);
    const currentActor = hydrateAdmin(actors[0]);
    if (!currentActor || !currentActor.is_active || currentActor.is_blocked) throw new ApiError('Forbidden', 403);
    const [targets] = await conn.execute('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL FOR UPDATE', [id]);
    const target = targets[0];
    if (!target) return null;
    return callback(conn, currentActor, target);
  });
}

async function protectLastSuper(conn, target, losesAccess) {
  if (!losesAccess || target.role !== 'admin' || !target.is_super_admin || !target.is_active || target.is_blocked) return;
  const [rows] = await conn.execute("SELECT COUNT(*) AS total FROM users WHERE role = 'admin' AND is_super_admin = 1 AND is_active = 1 AND is_blocked = 0 AND deleted_at IS NULL AND id <> ?", [target.id]);
  if (Number(rows[0].total) === 0) throw new ApiError('At least one active super administrator must remain', 400);
}

async function adminUpdate(id, data, actor) {
  const privateAddress = data.address === undefined ? undefined : accountAddress(data.address);
  const allowed = ['full_name', 'username', 'email', 'phone', 'facebook_id', 'role', 'avatar', 'city_id', 'district_id', 'latitude', 'longitude', 'is_active', 'is_blocked', 'is_verified'];
  for (const column of ['country_id', 'region_id', 'governorate_id']) {
    if (await tableHasColumn('users', column)) allowed.push(column);
  }
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(data[k]);
    }
  }
  if (data.password_hash) {
    fields.push('password_hash = ?');
    values.push(data.password_hash);
  }
  const updatedId = await lockedAdminMutation(id, actor, async (conn, currentActor, target) => {
    if (!hasPermission(currentActor, 'users.manage')) throw new ApiError('Forbidden', 403);
    if ((target.role === 'admin' || data.role === 'admin') && !canManageAdmin(currentActor, target)) throw new ApiError('Forbidden', 403);
    if (data.is_verified !== undefined && data.is_verified !== target.is_verified && !hasPermission(currentActor, 'verifications.review')) throw new ApiError('Forbidden', 403);
    requireIdentifier({ ...target, ...data });
    await checkIdentifierConflicts(conn, data, target);
    await protectLastSuper(conn, target, data.is_active === 0 || data.is_blocked === 1 || (data.role !== undefined && data.role !== 'admin'));
    if (data.role !== undefined && data.role !== target.role) {
      fields.push('is_super_admin = 0', "permissions = '[]'");
      if (data.role === 'provider') await conn.execute('INSERT INTO provider_profiles (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [id]);
      if (data.role === 'client') await conn.execute('INSERT INTO user_profiles (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [id]);
    }
    if (fields.length) {
      if (['password_hash', 'role', 'is_active', 'is_blocked', 'email', 'phone', 'username', 'facebook_id'].some(key => data[key] !== undefined)) fields.push('auth_version = auth_version + 1');
      await conn.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
      await invalidateContactVerification(conn, target, data);
    }
    if (privateAddress !== undefined) await saveAccountAddress(conn, id, privateAddress);
    return target.id;
  });
  return updatedId ? findById(updatedId) : null;
}

async function setBlocked(id, isBlocked, actor) {
  return adminUpdate(id, { is_blocked: isBlocked ? 1 : 0 }, actor);
}

async function saveAccountAddress(conn, id, address) {
  await conn.execute(`INSERT INTO user_profiles (user_id, address) VALUES (?, ?)
    ON CONFLICT (user_id) DO UPDATE SET address = EXCLUDED.address`, [id, address]);
}

// The caller holds the user's row lock. Request creation uses the same
// transaction for its snapshot and an explicitly requested default update.
async function saveAccountLocation(conn, id, location) {
  const allowed = ['city_id', 'district_id', 'latitude', 'longitude'];
  const [columns] = await conn.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'users'
      AND column_name IN ('country_id', 'region_id', 'governorate_id')`);
  allowed.push(...columns.map(column => column.column_name));
  const fields = allowed.filter(key => location[key] !== undefined);
  if (fields.length) await conn.execute(`UPDATE users SET ${fields.map(key => `${key} = ?`).join(', ')} WHERE id = ?`, [...fields.map(key => location[key]), id]);
  if (location.address !== undefined) await saveAccountAddress(conn, id, accountAddress(location.address));
}

async function softDelete(id, actor) {
  return lockedAdminMutation(id, actor, async (conn, currentActor, target) => {
    if (!hasPermission(currentActor, 'users.manage') || (target.role === 'admin' && !canManageAdmin(currentActor, target))) throw new ApiError('Forbidden', 403);
    await protectLastSuper(conn, target, true);
    await conn.execute('UPDATE users SET deleted_at = CURRENT_TIMESTAMP, auth_version = auth_version + 1 WHERE id = ?', [id]);
    return target.id;
  });
}

async function updateAdminPermissions(id, data, actor) {
  return lockedAdminMutation(id, actor, async (conn, currentActor, target) => {
    if (target.role !== 'admin' || !canManageAdmin(currentActor, target)) throw new ApiError('Forbidden', 403);
    const wantSuper = data.is_super_admin === undefined ? !!target.is_super_admin : (data.is_super_admin === true || data.is_super_admin === 1);
    if (wantSuper && !currentActor.is_super_admin) throw new ApiError('Forbidden', 403);
    let existing = target.permissions;
    if (typeof existing === 'string') { try { existing = JSON.parse(existing); } catch (_) { existing = []; } }
    const clean = sanitizePermissions(data.permissions === undefined ? existing : data.permissions);
    if (!currentActor.is_super_admin && clean.some(key => !hasPermission(currentActor, key))) throw new ApiError('Forbidden', 403);
    await protectLastSuper(conn, target, !wantSuper);
    await conn.execute('UPDATE users SET is_super_admin = ?, permissions = ?, auth_version = auth_version + 1 WHERE id = ?', [wantSuper ? 1 : 0, JSON.stringify(clean), id]);
    return { id: target.id, is_super_admin: wantSuper ? 1 : 0, permissions: clean };
  });
}

async function setOnline(id, isOnline) {
  await query(
    'UPDATE users SET is_online = ?, last_seen_at = CURRENT_TIMESTAMP WHERE id = ?',
    [isOnline ? 1 : 0, id]
  );
}

async function listPaginated({ role, search, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const where = ['u.deleted_at IS NULL'];
  const params = [];
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (search) {
    where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  const whereSql = where.join(' AND ');

  const items = await query(
    `SELECT ${SELECT_FIELDS}, c.name_ar AS city_name, c.name_en AS city_name_en
     FROM users u LEFT JOIN cities c ON u.city_id = c.id
     WHERE ${whereSql}
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [{ total }] = await query(
    `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`,
    params
  );
  return { items, total };
}

async function getProviderProfile(userId) {
  const row = await queryOne(
    `SELECT pp.*, u.full_name, u.email, u.phone, u.avatar, u.is_verified, u.is_online,
            c.name_ar AS city_name, c.name_en AS city_name_en,
            d.name_ar AS district_name, d.name_en AS district_name_en,
            EXISTS (SELECT 1 FROM provider_badges pb WHERE pb.user_id = pp.user_id AND pb.badge_type = 'trusted' AND pb.status = 'active' AND pb.ends_at > CURRENT_TIMESTAMP AND ${ProviderBadge.verifiedPaymentSql('pb')}) AS is_trusted,
            EXISTS (SELECT 1 FROM provider_badges pb WHERE pb.user_id = pp.user_id AND pb.badge_type = 'featured' AND pb.status = 'active' AND pb.ends_at > CURRENT_TIMESTAMP AND ${ProviderBadge.verifiedPaymentSql('pb')}) AS is_featured_badge,
            EXISTS (SELECT 1 FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.user_id = pp.user_id AND p.is_featured = 1 AND ${Subscription.validEntitlementSql('s', 'p')}) AS is_featured
     FROM provider_profiles pp
     JOIN users u ON pp.user_id = u.id
     LEFT JOIN cities c ON u.city_id = c.id
     LEFT JOIN districts d ON u.district_id = d.id
     WHERE pp.user_id = ? AND u.role = 'provider' AND u.deleted_at IS NULL`,
    [userId]
  );
  if (row) {
    row.badge_trusted_active = row.is_trusted ? 1 : 0;
    row.badge_featured_active = row.is_featured_badge ? 1 : 0;
    row.is_featured = row.is_featured ? 1 : 0;
    row.coverage_districts = await require('../utils/providerCoverage').coverageDistricts(userId);
  }
  return row;
}

async function updateProviderProfile(userId, data) {
  const allowed = ['business_name', 'bio', 'experience_years', 'category_id',
                   'service_radius_km', 'hourly_rate', 'cover_image',
                   'location_mode', 'fixed_latitude', 'fixed_longitude', 'fixed_address',
                   'show_location_on_map'];
  const fields = [];
  const values = [];
  for (const k of allowed) {
    if (data[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(data[k]);
    }
  }
  if (data.service_ids !== undefined) {
    fields.push('service_ids = ?');
    values.push(JSON.stringify(data.service_ids));
  }
  if (data.gallery !== undefined) {
    fields.push('gallery = ?');
    values.push(JSON.stringify(data.gallery));
  }
  if (!fields.length) return getProviderProfile(userId);
  values.push(userId);
  await query(`UPDATE provider_profiles SET ${fields.join(', ')} WHERE user_id = ?`, values);
  return getProviderProfile(userId);
}

module.exports = {
  findById, findByIdRaw, findByEmail, findByPhone, findByUsername, findByFacebookId, findByIdentifier,
  create, update, updatePassword, revokeSessions, updateAdminPermissions, completeLogin,
  softDelete, setBlocked, setOnline, listPaginated, adminUpdate,
  getProviderProfile, updateProviderProfile,
  saveAccountLocation,
};
