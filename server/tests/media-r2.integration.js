// AYK-248: uploads go to a private R2 bucket, never into the database or onto the disk. A local fake
// R2 checks every Signature V4 the server makes (header-signed writes, presigned downloads) and keeps
// the objects in memory. Uses its own disposable database.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const databasePrefix = process.env.AYK_MEDIA_R2_TEST_DB;

if (!databasePrefix) {
  test('R2 media integration (set AYK_MEDIA_R2_TEST_DB)', { skip: true }, () => {});
} else {
  if (!/^ayk_test_mediar2[a-z0-9_]{0,20}$/.test(databasePrefix)) throw new Error('Use a disposable ayk_test_mediar2* database prefix.');
  const databaseName = `${databasePrefix}_${crypto.randomBytes(8).toString('hex')}`;
  const port = Number(process.env.AYK_TEST_PORT || '5432');
  const secret = crypto.randomBytes(32).toString('hex');
  const keyId = crypto.randomBytes(16).toString('hex');
  const objects = new Map();
  const seen = [];
  let failPuts = false;

  // ---- fake R2 -------------------------------------------------------------------------------
  let storage;
  function verify(req, url, body) {
    const path = decodeURIComponent(url.pathname);
    if (url.searchParams.has('X-Amz-Signature')) {
      const query = Object.fromEntries([...url.searchParams].filter(([k]) => k !== 'X-Amz-Signature'));
      const time = query['X-Amz-Date'];
      const started = Date.UTC(+time.slice(0, 4), +time.slice(4, 6) - 1, +time.slice(6, 8), +time.slice(9, 11), +time.slice(11, 13), +time.slice(13, 15));
      if (Date.now() > started + Number(query['X-Amz-Expires']) * 1000) return 'expired';
      const headers = {};
      for (const name of query['X-Amz-SignedHeaders'].split(';')) if (name !== 'host') headers[name] = req.headers[name];
      const { signature } = storage._internal.signature({ method: req.method, host: req.headers.host, path, query, headers, payloadHash: 'UNSIGNED-PAYLOAD', secret, time });
      return signature === url.searchParams.get('X-Amz-Signature') ? null : 'bad query signature';
    }
    const auth = /Credential=([^/]+)\/[^,]+, SignedHeaders=([^,]+), Signature=([0-9a-f]+)/.exec(req.headers.authorization || '');
    if (!auth || auth[1] !== keyId) return 'no credential';
    const headers = {};
    for (const name of auth[2].split(';')) if (name !== 'host') headers[name] = req.headers[name];
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    if (req.headers['x-amz-content-sha256'] !== payloadHash) return 'payload hash';
    const { signature } = storage._internal.signature({ method: req.method, host: req.headers.host, path, headers, payloadHash, secret, time: req.headers['x-amz-date'] });
    return signature === auth[3] ? null : 'bad header signature';
  }
  const fake = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, `http://${req.headers.host}`);
      const problem = verify(req, url, body);
      seen.push({ method: req.method, path: url.pathname, presigned: url.searchParams.has('X-Amz-Signature'), problem });
      if (problem) { res.writeHead(403); return res.end(problem); }
      const key = decodeURIComponent(url.pathname);
      if (req.method === 'PUT') {
        if (failPuts) { res.writeHead(500); return res.end(); }
        objects.set(key, { body, type: req.headers['content-type'] });
        res.writeHead(200); return res.end();
      }
      const object = objects.get(key);
      if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
      if (!object) { res.writeHead(404); return res.end(); }
      const type = url.searchParams.get('response-content-type') || object.type;
      const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range || '');
      if (range) {
        const part = object.body.subarray(+range[1], +range[2] + 1);
        res.writeHead(206, { 'Content-Type': type, 'Content-Length': part.length, 'Content-Range': `bytes ${range[1]}-${range[2]}/${object.body.length}` });
        return res.end(part);
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': object.body.length });
      res.end(req.method === 'HEAD' ? undefined : object.body);
    });
  });

  let server, base, createdDatabase = false, db, UploadedMedia;
  const users = {};
  const { Client } = require('pg');
  const admin = () => new Client({ host: '127.0.0.1', port, user: 'postgres', password: '', database: 'postgres', ssl: false });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const pdf = Buffer.from('%PDF-1.4\nR2 test document');

  async function upload(user, files, expected = 201) {
    const body = new FormData();
    body.append('title', 'تسريب مياه في المطبخ');
    body.append('description', 'اختبار حفظ المرفقات في R2');
    for (const [bytes, name, type] of files) body.append('files', new Blob([bytes], { type }), name);
    const response = await fetch(`${base}/requests`, { method: 'POST', headers: { Authorization: `Bearer ${user.token}` }, body });
    const json = await response.json();
    assert.equal(response.status, expected, json.message);
    return json.data;
  }
  const media = (url, user, headers = {}) => fetch(base.replace(/\/api$/, '') + url, {
    redirect: 'manual', headers: { ...(user ? { Authorization: `Bearer ${user.token}` } : {}), ...headers },
  });

  test.before(async () => {
    await new Promise(resolve => fake.listen(0, '127.0.0.1', resolve));
    Object.assign(process.env, {
      NODE_ENV: 'test', AUTO_MIGRATE: 'false',
      DB_HOST: '127.0.0.1', DB_PORT: String(port), DB_NAME: databaseName, DB_USER: 'postgres', DB_PASSWORD: '',
      DATABASE_URL: '', DIRECT_DATABASE_URL: '', DB_SSL: 'false', MAIL_HOST: '', WHATSAPP_PROVIDER: '', PAYMENT_PROVIDER: '',
      BOOTSTRAP_ADMIN_EMAIL: '', BOOTSTRAP_ADMIN_PASSWORD: '', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
      R2_MEDIA_ENDPOINT: `http://127.0.0.1:${fake.address().port}`, R2_MEDIA_BUCKET: 'aykdmh-media',
      R2_MEDIA_ACCESS_KEY_ID: keyId, R2_MEDIA_SECRET_ACCESS_KEY: secret,
    });
    storage = require('../services/objectStorage');
    const client = admin();
    await client.connect();
    try { await client.query(`CREATE DATABASE "${databaseName}"`); createdDatabase = true; } finally { await client.end(); }
    db = require('../config/database');
    UploadedMedia = require('../models/UploadedMedia');
    const setup = await require('../services/installService').setupFromEnv();
    assert.equal(setup.migrations.flatMap(m => m.errors).length, 0);
    const jwt = require('../utils/jwt');
    for (const [name, role] of [['client', 'client'], ['outsider', 'client']]) {
      const row = await db.query('INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)', [name, `${name}-r2@test.invalid`, 'unused-local-test-hash', role]);
      users[name] = { id: row.insertId, token: jwt.sign({ id: row.insertId, role, auth_version: 0 }) };
    }
    server = require('../app').listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  });

  test.after(async () => {
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => fake.close(resolve));
    await db?.getPool().end();
    if (createdDatabase) {
      const client = admin();
      await client.connect();
      await client.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
      await client.end();
    }
  });

  test('attachments are stored in R2 only: the database keeps metadata, no bytes', async () => {
    const request = await upload(users.client, [[png, 'leak.png', 'image/png'], [pdf, 'quote.pdf', 'application/pdf']]);
    assert.equal(request.files.length, 2);
    const rows = await db.query("SELECT storage, object_key, status, data, size, mime FROM uploaded_media WHERE owner_id = ? ORDER BY mime", [users.client.id]);
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.storage, 'r2');
      assert.equal(row.status, 'ready');
      assert.equal(row.data, null, 'no bytes in the database');
      assert.match(row.object_key, /^requests\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);
      const stored = objects.get(`/aykdmh-media/${row.object_key}`);
      assert.ok(stored, 'object exists in the bucket');
      assert.equal(stored.body.length, Number(row.size));
      assert.equal(stored.type, row.mime);
    }
    assert.ok(seen.filter(s => s.method === 'PUT').every(s => !s.problem && !s.presigned), 'server writes are header-signed and valid');
  });

  test('downloads keep the access check, then redirect to a short signed R2 link that works (with ranges)', async () => {
    const [{ file_url: url }] = (await db.query("SELECT '/api/media/' || id AS file_url FROM uploaded_media WHERE owner_id = ? AND mime = 'image/png'", [users.client.id]));
    assert.equal((await media(url)).status, 401);
    assert.equal((await media(url, users.outsider)).status, 404, 'outsider sees nothing');
    const response = await media(url, users.client);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const location = new URL(response.headers.get('location'));
    assert.equal(location.searchParams.get('X-Amz-Expires'), '300');
    assert.equal(location.searchParams.get('response-content-type'), 'image/png');
    assert.ok(!location.href.includes(secret));
    const fetched = await fetch(location);
    assert.equal(fetched.status, 200);
    assert.deepEqual(Buffer.from(await fetched.arrayBuffer()), png);
    const part = await fetch(location, { headers: { Range: 'bytes=1-3' } });
    assert.equal(part.status, 206);
    assert.equal(Buffer.from(await part.arrayBuffer()).toString('latin1'), 'PNG');
    const tampered = new URL(location);
    tampered.pathname = tampered.pathname.replace(/[0-9a-f]{12}$/, '000000000000');
    assert.equal((await fetch(tampered)).status, 403, 'a link opens only its own object');
  });

  test('PDF downloads are attachments; expired links are refused', async () => {
    const [{ id, object_key: key }] = await db.query("SELECT id, object_key FROM uploaded_media WHERE owner_id = ? AND mime = 'application/pdf'", [users.client.id]);
    const location = new URL((await media(`/api/media/${id}`, users.client)).headers.get('location'));
    assert.match(location.searchParams.get('response-content-disposition'), /^attachment; filename="document.pdf"/);
    const old = storage.presign('GET', key, { expires: 60, now: new Date(Date.now() - 10 * 60 * 1000) });
    assert.equal((await fetch(old)).status, 403);
  });

  test('if R2 refuses an upload, nothing is saved: no request, no media row', async () => {
    const before = Number((await db.queryOne('SELECT COUNT(*) AS n FROM uploaded_media')).n);
    const requestsBefore = Number((await db.queryOne('SELECT COUNT(*) AS n FROM requests')).n);
    failPuts = true;
    try {
      const body = new FormData();
      body.append('title', 'طلب يفشل رفعه');
      body.append('description', 'R2 refuses');
      body.append('files', new Blob([png], { type: 'image/png' }), 'x.png');
      const response = await fetch(`${base}/requests`, { method: 'POST', headers: { Authorization: `Bearer ${users.client.token}` }, body });
      assert.ok(response.status >= 500, `status ${response.status}`);
    } finally { failPuts = false; }
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM uploaded_media')).n), before);
    assert.equal(Number((await db.queryOne('SELECT COUNT(*) AS n FROM requests')).n), requestsBefore);
  });

  test('removing media deletes the R2 object too', async () => {
    const [row] = await db.query("SELECT id, object_key FROM uploaded_media WHERE owner_id = ? AND mime = 'image/png'", [users.client.id]);
    assert.ok(objects.has(`/aykdmh-media/${row.object_key}`));
    await UploadedMedia.removeBatch([row.id]);
    assert.equal(objects.has(`/aykdmh-media/${row.object_key}`), false);
    assert.equal(await db.queryOne('SELECT id FROM uploaded_media WHERE id = ?', [row.id]), null);
  });

  test('the database refuses inconsistent rows (bytes and an object key, or neither)', async () => {
    const id = crypto.randomUUID();
    await assert.rejects(db.query("INSERT INTO uploaded_media (id, owner_id, scope, filename, mime, size, data, storage, object_key) VALUES (?, ?, 'chat', 'a', 'image/png', 1, NULL, 'r2', NULL)", [id, users.client.id]));
    await assert.rejects(db.query("INSERT INTO uploaded_media (id, owner_id, scope, filename, mime, size, data, storage, object_key) VALUES (?, ?, 'chat', 'a', 'image/png', 1, ?, 'r2', 'k')", [id, users.client.id, Buffer.from('x')]));
    await assert.rejects(db.query("INSERT INTO uploaded_media (id, owner_id, scope, filename, mime, size, data, storage, object_key) VALUES (?, ?, 'chat', 'a', 'video/mp4', 104857601, NULL, 'r2', 'k')", [id, users.client.id]));
  });
}
