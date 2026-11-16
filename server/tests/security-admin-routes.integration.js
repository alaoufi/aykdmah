// AYK-243: every admin route refuses identities without the permission.
// The routes are read from the Express router stack itself, not from a hand-kept
// list, so a route added later without requirePermission(...) fails this suite.
// This suite only creates, uses, and drops its own random localhost database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

if (process.env.AYK_SECURITY_ADMIN_ROUTES_TEST !== '1') {
  test('security/admin routes sweep (set AYK_SECURITY_ADMIN_ROUTES_TEST=1)', { skip: true }, () => {});
} else {
  const databaseName = `ayk_test_adminroutes_${crypto.randomBytes(10).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || '55432');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('Invalid localhost test port');
  Object.assign(process.env, {
    NODE_ENV: 'test', AUTO_MIGRATE: 'false', API_RATE_LIMIT: '100000',
    DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName,
    DB_USER: 'postgres', DB_PASSWORD: '', DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false',
    BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', ENCRYPTION_KEY: '',
    MAIL_HOST: '', MAIL_USER: '', MAIL_PASSWORD: '', MAIL_FROM: '',
    WHATSAPP_PROVIDER: '', WHATSAPP_TOKEN: '', WHATSAPP_FROM: '',
    PAYMENT_PROVIDER: '', PAYMENT_SECRET_KEY: '', PAYMENT_PUBLIC_KEY: '', PAYMENT_WEBHOOK_SECRET: '',
    PUSH_PUBLIC_KEY: '', PUSH_PRIVATE_KEY: '', GOOGLE_MAPS_API_KEY: '',
    JWT_SECRET: crypto.randomBytes(48).toString('hex'), JWT_EXPIRES_IN: '1h',
    APP_URL: 'http://127.0.0.1', CLIENT_URL: 'http://127.0.0.1',
  });

  // Mark the guards before any route file loads, so the router stack can tell them apart.
  // The returned middleware is the original one: route behavior does not change.
  const roleCheck = require('../middleware/roleCheck');
  const originalRequirePermission = roleCheck.requirePermission;
  roleCheck.requirePermission = key => Object.assign(originalRequirePermission(key), { aykPermission: key });
  const isGuard = handle => handle === roleCheck.requireAdmin || typeof handle?.aykPermission === 'string';

  const { Client } = require('pg');
  const db = require('../config/database');
  const User = require('../models/User');
  const install = require('../services/installService');
  const jwt = require('../utils/jwt');
  const { hashPassword } = require('../utils/hash');

  const routesDir = path.join(__dirname, '..', 'routes');
  const maintenanceClient = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false, connectionTimeoutMillis: 15000 });
  const identity = () => `adminsweep_${crypto.randomBytes(6).toString('hex')}`;
  const tokenFor = user => jwt.sign({ id: Number(user.id), role: user.role, auth_version: Number(user.auth_version || 0) });
  let server, base, createdDatabase = false, app, identities, hash;

  async function createUser(role) {
    const id = await User.create({ full_name: 'Local Admin Sweep', username: identity(), password_hash: hash, role });
    return User.findByIdRaw(id);
  }

  // Express 4 keeps a mount path only as a regular expression; rebuild it, and refuse
  // anything this reader does not understand rather than silently skipping a route.
  function mountPath(layer) {
    if (layer.regexp.fast_slash) return '';
    let source = layer.regexp.source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
    source = source.replace(/\(\?:\\\/\(\[\^\\\/\]\+\?\)\)/g, '/:param').replace(/\\(.)/g, '$1');
    if (/[()[\]?*+|^$]/.test(source)) throw new Error(`Unreadable mount path: ${layer.regexp}`);
    return source;
  }

  // Walk the whole stack. A router-wide guard (router.use(requireAdmin) or
  // router.use(requirePermission(...))) covers every layer that follows it in that router.
  function collectRoutes(stack, prefix = '', inheritedGuard = false, owner = null, out = []) {
    let guarded = inheritedGuard;
    for (const layer of stack) {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).filter(m => layer.route.methods[m]);
        const routeGuard = layer.route.stack.some(l => isGuard(l.handle));
        // A regular-expression path cannot be filled in; it is recorded so that a guarded
        // or admin one fails the sweep instead of being skipped (the public SEO pages use them).
        for (const routePath of [].concat(layer.route.path)) {
          const readable = typeof routePath === 'string';
          out.push({ path: prefix + (readable ? routePath : String(routePath)), readable, methods, guarded: guarded || routeGuard, owner });
        }
      } else if (layer.name === 'router' && Array.isArray(layer.handle?.stack)) {
        collectRoutes(layer.handle.stack, prefix + mountPath(layer), guarded, layer.handle, out);
      } else if (isGuard(layer.handle) && layer.regexp.fast_slash) {
        guarded = true;
      }
    }
    return out;
  }

  const concretePath = route => route.replace(/:[A-Za-z_][A-Za-z0-9_]*\??/g, '1');
  const isAdminArea = route => /^\/api\/admin(\/|$)/.test(route) || /\/admin(\/|$)/.test(route);

  test.before(async () => {
    const maintenance = maintenanceClient();
    await maintenance.connect();
    try { await maintenance.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; }
    finally { await maintenance.end(); }
    let setup;
    try { setup = await install.setupFromEnv(); }
    catch (err) {
      const diagnostics = await install.runMigrationsFromEnv();
      const failures = diagnostics.applied.filter(item => item.errors.length).map(item => ({ file: item.file, errors: item.errors }));
      throw new Error(`Local disposable migration failure: ${JSON.stringify(failures)}`);
    }
    assert.equal(setup.migrations.flatMap(item => item.errors).length, 0);
    hash = await hashPassword('Local-Admin-Sweep-Password-2026');
    const emptyAdmin = await createUser('admin');
    await db.query('UPDATE users SET permissions = ?, is_super_admin = 0 WHERE id = ?', [JSON.stringify([]), emptyAdmin.id]);
    const client = await createUser('client');
    const provider = await createUser('provider');
    identities = [
      { name: 'no token', token: null },
      { name: 'client', token: tokenFor(client) },
      { name: 'provider', token: tokenFor(provider) },
      { name: 'admin with empty permissions', token: tokenFor(await User.findByIdRaw(emptyAdmin.id)) },
    ];
    app = require('../app');
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  test.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.getPool().end();
    if (createdDatabase) {
      const maintenance = maintenanceClient();
      await maintenance.connect();
      try { await maintenance.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
      finally { await maintenance.end(); }
    }
  });

  test('the empty-permissions admin really is a non-super admin with no permissions', async () => {
    const [row] = await db.query("SELECT role, is_super_admin, permissions FROM users WHERE role = 'admin' AND username LIKE 'adminsweep_%'");
    assert.equal(row.role, 'admin');
    assert.equal(Number(row.is_super_admin), 0);
    const permissions = typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions;
    assert.deepEqual(permissions, []);
  });

  test('every admin route and every guarded route refuses all four identities with 401 or 403', async t => {
    const all = collectRoutes(app._router.stack);
    const targets = all.filter(route => route.guarded || isAdminArea(route.path));

    // Each route file that uses requireAdmin or requirePermission must be reached by the walk.
    const guardedFiles = fs.readdirSync(routesDir).filter(name => name.endsWith('.js'))
      .filter(name => /requireAdmin|requirePermission/.test(fs.readFileSync(path.join(routesDir, name), 'utf8')));
    assert.ok(guardedFiles.length >= 10, `expected many guarded route files, found ${guardedFiles.length}`);
    for (const name of guardedFiles) {
      const exported = require(path.join(routesDir, name));
      const routers = [exported, exported?.router, exported?.webhook].filter(r => typeof r === 'function');
      const count = targets.filter(route => routers.includes(route.owner) && route.guarded).length;
      assert.ok(count > 0, `${name}: no guarded route found in the router stack`);
      // Independent cross-check: the stack holds as many routes as the file declares.
      const declared = (fs.readFileSync(path.join(routesDir, name), 'utf8').match(/^(?:router|webhook)\.(get|post|put|patch|delete|all)\(/gm) || []).length;
      assert.equal(all.filter(route => routers.includes(route.owner)).length, declared, `${name}: router stack and source disagree on the number of routes`);
    }
    const adminMounted = targets.filter(route => route.path.startsWith('/api/admin'));

    const failures = targets.filter(route => !route.readable).map(route => `${route.path}: path is a regular expression; the sweep cannot call it`);
    let calls = 0;
    for (const route of targets.filter(item => item.readable)) {
      for (const method of route.methods) {
        const httpMethod = method === '_all' ? 'POST' : method.toUpperCase();
        for (const who of identities) {
          const headers = { 'X-Ayk-Scope': 'admin', 'Content-Type': 'application/json' };
          if (who.token) headers.Authorization = `Bearer ${who.token}`;
          const response = await fetch(base + concretePath(route.path), {
            method: httpMethod, headers, body: ['GET', 'HEAD'].includes(httpMethod) ? undefined : '{}',
          });
          await response.arrayBuffer();
          calls += 1;
          if (![401, 403].includes(response.status)) {
            failures.push(`${httpMethod} ${route.path} as ${who.name} -> ${response.status}${route.guarded ? '' : ' (no requireAdmin/requirePermission in its chain)'}`);
          }
        }
      }
    }
    const methodCount = targets.reduce((sum, route) => sum + route.methods.length, 0);
    t.diagnostic(`routes in stack: ${all.length}; swept routes: ${targets.length} (${adminMounted.length} under /api/admin); route-methods: ${methodCount}; requests: ${calls}; guarded route files: ${guardedFiles.length}`);
    assert.deepEqual(failures, [], `Routes that did not refuse an identity without permission:\n${failures.join('\n')}`);
  });
}
