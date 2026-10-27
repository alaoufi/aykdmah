const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runScript(script, overrides = {}) {
  const childEnv = {
    ...process.env,
    NODE_ENV: 'production',
    VERCEL: '1',
    JWT_SECRET: 'ryza-test-only-signing-key-never-use-in-deployment',
    DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_POOL_MAX: '',
    PAYMENT_PROVIDER: '',
    ...overrides,
  };
  delete childEnv.AUTO_MIGRATE;
  if (Object.hasOwn(overrides, 'AUTO_MIGRATE')) childEnv.AUTO_MIGRATE = overrides.AUTO_MIGRATE;
  const result = spawnSync(process.execPath, ['--no-experimental-require-module', '-e', script], {
    cwd: path.join(__dirname, '..'), env: childEnv, encoding: 'utf8', timeout: 20_000,
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

test('Vercel disables automatic schema work and limits connections by default', () => {
  const defaults = runScript(`
    const env = require('./config/env');
    const { poolOptions } = require('./config/database');
    console.log(JSON.stringify({ migrations: env.AUTO_MIGRATE, max: poolOptions(env.DB).max }));
  `);
  assert.deepEqual(defaults, { migrations: false, max: 3 });
  const configured = runScript(`
    const env = require('./config/env');
    console.log(JSON.stringify({ migrations: env.AUTO_MIGRATE, max: require('./config/database').poolOptions(env.DB).max }));
  `, { DB_POOL_MAX: '2', AUTO_MIGRATE: 'true' });
  assert.deepEqual(configured, { migrations: true, max: 2 });
});

test('schema jobs select the direct Neon URL and refuse transaction poolers', () => {
  const selected = runScript(`
    const { clientOptions } = require('./services/installService');
    const config = clientOptions();
    console.log(JSON.stringify({ host: new URL(config.connectionString).hostname, verified: config.ssl.rejectUnauthorized }));
  `, {
    DATABASE_URL: 'postgres://test:unused@ep-example-pooler.us-east-2.aws.neon.tech/test?sslmode=require',
    DIRECT_DATABASE_URL: 'postgres://test:unused@ep-example.us-east-2.aws.neon.tech/test?sslmode=require',
    DB_SSL: 'strict',
  });
  assert.deepEqual(selected, { host: 'ep-example.us-east-2.aws.neon.tech', verified: true });
  const rejected = runScript(`
    let refused = false;
    try { require('./services/installService').clientOptions(); }
    catch (err) { refused = /DIRECT_DATABASE_URL/.test(err.message); }
    console.log(JSON.stringify({ refused }));
  `, { DATABASE_URL: 'postgres://test:unused@ep-example-pooler.us-east-2.aws.neon.tech/test' });
  assert.equal(rejected.refused, true);
});

test('production payment sessions and webhooks are rejected before any payment mutation', () => {
  const result = runScript(`
    (async () => {
      const assert = require('node:assert/strict');
      const Payment = require('./models/Payment');
      const Subscription = require('./models/Subscription');
      Payment.create = () => { throw new Error('Payment must not be created'); };
      Payment.updateStatus = () => { throw new Error('Payment must not be modified'); };
      Subscription.activateSubscription = () => { throw new Error('Subscription must not activate'); };
      const controller = require('./controllers/paymentController');
      const invoke = handler => new Promise((resolve, reject) => {
        let status;
        handler({ body: { amount: 40, subscription_id: 1, tx: 'forged' }, user: { id: 1 }, headers: {} }, {
          status(code) { status = code; return this; },
          json(body) { resolve({ status, body }); },
        }, reject);
      });
      const session = await invoke(controller.createSession);
      const webhook = await invoke(controller.webhook);
      const service = require('./services/paymentService');
      const direct = await service.verifyWebhook({ tx: 'forged' });
      console.log(JSON.stringify({ session, webhook, direct }));
    })().catch(err => { console.error(err); process.exitCode = 1; });
  `, { PAYMENT_PROVIDER: 'mock' });
  assert.equal(result.session.status, 503);
  assert.equal(result.session.body.success, false);
  assert.match(result.session.body.message, /لن يتم تحصيل/);
  assert.equal(result.webhook.status, 503);
  assert.equal(result.webhook.body.ok, false);
  assert.equal(result.direct.ok, false);
});

test('a provider name without an implemented adapter cannot activate payments', () => {
  const result = runScript(`
    const service = require('./services/paymentService');
    console.log(JSON.stringify(service.getAvailability()));
  `, { NODE_ENV: 'test', VERCEL: '', PAYMENT_PROVIDER: 'moyasar' });
  assert.equal(result.ready, false);
});

test('production health responds without schema work and the filesystem installer is hidden', () => {
  const result = runScript(`
    (async () => {
      const install = require('./services/installService');
      install.runMigrationsFromEnv = () => { throw new Error('No schema work on Vercel'); };
      const server = require('./app').listen(0);
      await new Promise(resolve => server.once('listening', resolve));
      const base = 'http://127.0.0.1:' + server.address().port;
      try {
        const health = await fetch(base + '/api/health');
        const installer = await fetch(base + '/install');
        console.log(JSON.stringify({ health: health.status, installer: installer.status }));
      } finally { await new Promise(resolve => server.close(resolve)); }
    })().catch(err => { console.error(err); process.exitCode = 1; });
  `);
  assert.deepEqual(result, { health: 200, installer: 404 });
});

test('text-only sanitization strips executable markup and preserves Arabic without require(ESM)', () => {
  const result = runScript(`
    (async () => {
      const { sanitizeString, sanitizeBody } = require('./middleware/validate');
      const inputs = [
        '  محمد <b>العوفي</b>  ',
        '<script>alert(1)</script><style>body{}</style><textarea>private</textarea><option>hidden</option>Safe',
        'محمد &amp; علي &lt; المنزل &gt;',
        '<form action="javascript:alert(1)">محمد</form>',
        '<svg><animate values="javascript:alert(1);x"/></svg>نص',
        '<textarea></textarea/><img src=x onerror=alert(1)>Safe',
        '<b>one<i>two</b>three',
        '&lt;img src=x onerror=alert(1)&gt;',
      ];
      const values = await Promise.all(inputs.map(sanitizeString));
      const req = { body: { full_name: '<b>محمد</b>', untouched: '<b>unchanged</b>' } };
      await new Promise((resolve, reject) => sanitizeBody(['full_name'])(req, {}, err => err ? reject(err) : resolve()));
      console.log(JSON.stringify({ values, body: req.body, nullValue: await sanitizeString(null) }));
    })().catch(err => { console.error(err); process.exitCode = 1; });
  `);
  assert.deepEqual(result.values, [
    'محمد العوفي', 'Safe', 'محمد &amp; علي &lt; المنزل &gt;', 'محمد', 'نص', 'Safe',
    'onetwothree', '&lt;img src=x onerror=alert(1)&gt;',
  ]);
  assert.deepEqual(result.body, { full_name: 'محمد', untouched: '<b>unchanged</b>' });
  assert.equal(result.nullValue, null);
});

test('local requests wait for migration completion and concurrent requests share one schema job', () => {
  const result = runScript(`
    (async () => {
      let release;
      let started;
      let calls = 0;
      const began = new Promise(resolve => { started = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      require('./services/installService').runMigrationsFromEnv = async () => {
        calls++; started(); await gate; return { applied: [] };
      };
      const server = require('./app').listen(0);
      await new Promise(resolve => server.once('listening', resolve));
      const base = 'http://127.0.0.1:' + server.address().port;
      let completed = 0;
      try {
        const requests = [fetch(base + '/api/health'), fetch(base + '/api/health')]
          .map(p => p.then(r => { completed++; return r.status; }));
        await began;
        await new Promise(resolve => setImmediate(resolve));
        const before = completed;
        release();
        const statuses = await Promise.all(requests);
        console.log(JSON.stringify({ before, calls, statuses }));
      } finally { release(); await new Promise(resolve => server.close(resolve)); }
    })().catch(err => { console.error(err); process.exitCode = 1; });
  `, { NODE_ENV: 'test', VERCEL: '', AUTO_MIGRATE: 'true' });
  assert.equal(result.before, 0);
  assert.equal(result.calls, 1);
  assert.deepEqual(result.statuses, [200, 200]);
});
